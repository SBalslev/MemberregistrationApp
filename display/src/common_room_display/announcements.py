from __future__ import annotations

import json
import logging
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from .uploads import UploadRejected, process_display_image

LOGGER = logging.getLogger(__name__)
MAX_ANNOUNCEMENT_FEED_BYTES = 256 * 1024
MAX_ANNOUNCEMENT_IMAGE_BYTES = 10 * 1024 * 1024
ANNOUNCEMENT_ID = re.compile(
    r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
)
DISPLAY_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
IMAGE_FILE = re.compile(
    r"^(?P<id>[a-f0-9-]{36})-(?P<version>[1-9][0-9]*)\.jpg$"
)


class AnnouncementCache:
    def __init__(self, cache_path: Path, media_directory: Path) -> None:
        self._cache_path = cache_path
        self._media_directory = media_directory
        self._lock = threading.Lock()
        self._payload: dict[str, Any] | None = None
        self._load_disk_cache()

    def image_path(self, announcement_id: str, version: int) -> Path:
        return self._media_directory / f"{announcement_id}-{version}.jpg"

    def store_image(self, announcement_id: str, version: int, body: bytes) -> None:
        processed = process_display_image(body)
        target = self.image_path(announcement_id, version)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(".tmp")
        temporary.write_bytes(processed)
        temporary.replace(target)

    def update(self, payload: dict[str, Any]) -> None:
        _validate_payload(payload)
        for announcement in payload["announcements"]:
            if announcement["imagePath"] is not None:
                image_path = self.image_path(announcement["id"], announcement["version"])
                if not image_path.is_file():
                    raise ValueError("Announcement image is missing from the local cache")
        self._cache_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self._cache_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        temporary.replace(self._cache_path)
        with self._lock:
            self._payload = payload
        self._cleanup_images(payload)

    def snapshot(self, now: float | None = None) -> list[dict[str, Any]]:
        current_time = now if now is not None else time.time()
        with self._lock:
            payload = self._payload
        if payload is None:
            return []
        active: list[dict[str, Any]] = []
        for announcement in payload["announcements"]:
            starts_at = _parse_timestamp(announcement["startsAt"])
            ends_at = _parse_timestamp(announcement["endsAt"])
            if starts_at <= current_time < ends_at:
                item = dict(announcement)
                if item["imagePath"] is not None:
                    filename = self.image_path(item["id"], item["version"]).name
                    item["imageUrl"] = f"/media/announcements/{filename}"
                else:
                    item["imageUrl"] = None
                item.pop("imagePath", None)
                active.append(item)
        return active

    def resolve_media(self, filename: str) -> Path | None:
        if IMAGE_FILE.fullmatch(filename) is None:
            return None
        candidate = self._media_directory / filename
        if not candidate.is_file():
            return None
        active_filenames = {
            self.image_path(item["id"], item["version"]).name
            for item in self.snapshot()
            if item["imageUrl"] is not None
        }
        return candidate if filename in active_filenames else None

    def _load_disk_cache(self) -> None:
        if not self._cache_path.exists():
            return
        try:
            payload = json.loads(self._cache_path.read_text(encoding="utf-8"))
            _validate_payload(payload)
            self._payload = payload
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            LOGGER.warning("Ignoring invalid announcement cache", exc_info=True)

    def _cleanup_images(self, payload: dict[str, Any]) -> None:
        expected = {
            self.image_path(item["id"], item["version"]).name
            for item in payload["announcements"]
            if item["imagePath"] is not None
        }
        if not self._media_directory.exists():
            return
        for path in self._media_directory.iterdir():
            if path.is_file() and IMAGE_FILE.fullmatch(path.name) and path.name not in expected:
                try:
                    path.unlink()
                except OSError:
                    LOGGER.warning("Unable to remove stale announcement image %s", path)


class AnnouncementPoller(threading.Thread):
    def __init__(
        self,
        base_url: str,
        device_token: str,
        display_id: str,
        interval_seconds: int,
        cache: AnnouncementCache,
    ) -> None:
        super().__init__(name="display-announcement-poller", daemon=True)
        self._base_url = base_url.rstrip("/")
        self._device_token = device_token
        self._display_id = display_id
        self._interval_seconds = interval_seconds
        self._cache = cache
        self._stopped = threading.Event()

    def run(self) -> None:
        while not self._stopped.is_set():
            try:
                self.poll_once()
            except (OSError, ValueError, json.JSONDecodeError, UploadRejected):
                LOGGER.warning("Unable to refresh display announcements", exc_info=True)
            self._stopped.wait(self._interval_seconds)

    def stop(self) -> None:
        self._stopped.set()

    def poll_once(self) -> None:
        path = f"/display-content/{self._display_id}/announcements"
        request = self._request(path)
        with urlopen(request, timeout=10) as response:
            content_length = response.headers.get("Content-Length")
            if content_length is not None and int(content_length) > MAX_ANNOUNCEMENT_FEED_BYTES:
                raise ValueError("Announcement feed exceeds maximum size")
            body = response.read(MAX_ANNOUNCEMENT_FEED_BYTES + 1)
        if len(body) > MAX_ANNOUNCEMENT_FEED_BYTES:
            raise ValueError("Announcement feed exceeds maximum size")
        payload = json.loads(body.decode("utf-8"))
        _validate_payload(payload, expected_display_id=self._display_id)

        for announcement in payload["announcements"]:
            image_path = announcement["imagePath"]
            if image_path is None:
                continue
            local_path = self._cache.image_path(announcement["id"], announcement["version"])
            if local_path.is_file():
                continue
            self._download_image(image_path, announcement["id"], announcement["version"])
        self._cache.update(payload)

    def _download_image(self, path: str, announcement_id: str, version: int) -> None:
        request = self._request(path)
        with urlopen(request, timeout=15) as response:
            content_length = response.headers.get("Content-Length")
            if content_length is not None and int(content_length) > MAX_ANNOUNCEMENT_IMAGE_BYTES:
                raise ValueError("Announcement image exceeds maximum size")
            body = response.read(MAX_ANNOUNCEMENT_IMAGE_BYTES + 1)
        if len(body) > MAX_ANNOUNCEMENT_IMAGE_BYTES:
            raise ValueError("Announcement image exceeds maximum size")
        self._cache.store_image(announcement_id, version, body)

    def _request(self, path: str) -> Request:
        if not path.startswith("/") or path.startswith("//"):
            raise ValueError("Announcement path must be relative to the configured API")
        return Request(
            f"{self._base_url}{path}",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self._device_token}",
            },
        )


def _validate_payload(payload: object, expected_display_id: str | None = None) -> None:
    if not isinstance(payload, dict):
        raise ValueError("Announcement feed must be an object")
    if payload.get("schemaVersion") != 1:
        raise ValueError("Unsupported announcement feed schema version")
    display_id = payload.get("displayId")
    if not isinstance(display_id, str) or DISPLAY_ID.fullmatch(display_id) is None:
        raise ValueError("Announcement feed has an invalid display ID")
    if expected_display_id is not None and display_id != expected_display_id:
        raise ValueError("Announcement feed is for a different display")
    _parse_timestamp(payload.get("serverTime"))
    announcements = payload.get("announcements")
    if not isinstance(announcements, list) or len(announcements) > 100:
        raise ValueError("Announcement feed has an invalid announcement list")
    seen_ids: set[str] = set()
    for item in announcements:
        _validate_announcement(item)
        if item["id"] in seen_ids:
            raise ValueError("Announcement feed contains duplicate IDs")
        seen_ids.add(item["id"])


def _validate_announcement(item: object) -> None:
    if not isinstance(item, dict):
        raise ValueError("Announcement must be an object")
    announcement_id = item.get("id")
    if not isinstance(announcement_id, str) or ANNOUNCEMENT_ID.fullmatch(announcement_id) is None:
        raise ValueError("Announcement has an invalid ID")
    title = item.get("title")
    body = item.get("body")
    if not isinstance(title, str) or not 1 <= len(title) <= 80:
        raise ValueError("Announcement has an invalid title")
    if not isinstance(body, str) or not 1 <= len(body) <= 600:
        raise ValueError("Announcement has invalid body text")
    if item.get("priority") not in ("normal", "important"):
        raise ValueError("Announcement has an invalid priority")
    starts_at = _parse_timestamp(item.get("startsAt"))
    ends_at = _parse_timestamp(item.get("endsAt"))
    if ends_at <= starts_at:
        raise ValueError("Announcement has an invalid schedule")
    duration = item.get("displayDurationSeconds")
    if not isinstance(duration, int) or isinstance(duration, bool) or not 8 <= duration <= 60:
        raise ValueError("Announcement has an invalid display duration")
    version = item.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise ValueError("Announcement has an invalid version")
    image_path = item.get("imagePath")
    if image_path is not None:
        expected_suffix = f"/announcements/{announcement_id}/image"
        if (
            not isinstance(image_path, str)
            or not image_path.startswith("/display-content/")
            or not image_path.endswith(expected_suffix)
        ):
            raise ValueError("Announcement has an invalid image path")


def _parse_timestamp(value: object) -> float:
    if not isinstance(value, str):
        raise ValueError("Announcement timestamp must be a string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("Announcement timestamp is invalid") from error
    if parsed.tzinfo is None:
        raise ValueError("Announcement timestamp must include a timezone")
    return parsed.astimezone(timezone.utc).timestamp()
