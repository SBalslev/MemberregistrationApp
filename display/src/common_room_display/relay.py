from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from datetime import datetime
from typing import Any
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from .feed import MAX_FEED_BYTES
from .uploads import UploadQuotaExceeded, UploadRejected, UploadService

LOGGER = logging.getLogger(__name__)
MAX_RELAY_RESPONSE_BYTES = MAX_FEED_BYTES
MAX_RELAY_PHOTO_BYTES = 10 * 1024 * 1024
INVITATION_REFRESH_SECONDS = 55 * 60


class DisplayRelayClient(threading.Thread):
    def __init__(
        self,
        base_url: str,
        device_token: str,
        display_id: str,
        poll_interval_seconds: int,
        uploads: UploadService,
        fallback_upload_url: str,
    ) -> None:
        super().__init__(name="display-photo-relay", daemon=True)
        self._base_url = base_url
        self._device_token = device_token
        self._display_id = display_id
        self._poll_interval_seconds = poll_interval_seconds
        self._uploads = uploads
        self._fallback_upload_url = fallback_upload_url
        self._upload_url = fallback_upload_url
        self._invitation_created_at = 0.0
        self._invitation_expires_at = 0.0
        self._lock = threading.Lock()
        self._stopped = threading.Event()

    @property
    def upload_url(self) -> str:
        with self._lock:
            return self._upload_url

    def stop(self) -> None:
        self._stopped.set()

    def run(self) -> None:
        while not self._stopped.is_set():
            try:
                self.poll_once()
            except (
                OSError,
                ValueError,
                json.JSONDecodeError,
                sqlite3.Error,
                UploadQuotaExceeded,
            ):
                self._use_fallback_if_expired()
                LOGGER.warning("Unable to refresh display photo relay", exc_info=True)
            self._stopped.wait(self._poll_interval_seconds)

    def poll_once(self, now: float | None = None) -> None:
        current_time = now if now is not None else time.time()
        if (
            self._invitation_created_at == 0
            or current_time - self._invitation_created_at >= INVITATION_REFRESH_SECONDS
        ):
            self._create_invitation(current_time)
        while self._download_next_photo():
            pass

    def _create_invitation(self, current_time: float) -> None:
        response = self._json_request(
            "/display-relay/invitations",
            method="POST",
            body={"display_id": self._display_id},
        )
        upload_url = str(response.get("upload_url", ""))
        if not upload_url.startswith("https://"):
            raise ValueError("Relay returned an invalid upload URL")
        expires_at = str(response.get("expires_at", ""))
        try:
            expires_timestamp = datetime.fromisoformat(
                expires_at.replace("Z", "+00:00")
            ).timestamp()
        except ValueError as error:
            raise ValueError("Relay returned an invalid invitation expiry") from error
        with self._lock:
            self._upload_url = upload_url
            self._invitation_expires_at = expires_timestamp
        self._invitation_created_at = current_time
        LOGGER.info("Created rotating display upload invitation")

    def _use_fallback_if_expired(self, now: float | None = None) -> None:
        current_time = now if now is not None else time.time()
        with self._lock:
            if self._invitation_expires_at and current_time >= self._invitation_expires_at:
                self._upload_url = self._fallback_upload_url
                self._invitation_expires_at = 0.0

    def _download_next_photo(self) -> bool:
        query = urlencode({"display_id": self._display_id})
        response = self._json_request(f"/display-relay/photos/next?{query}")
        photo = response.get("photo")
        if photo is None:
            return False
        if not isinstance(photo, dict):
            raise ValueError("Relay returned invalid photo metadata")
        photo_id = str(photo.get("id", ""))
        content_type = str(photo.get("mime_type", ""))
        if len(photo_id) != 32 or any(character not in "0123456789abcdef" for character in photo_id):
            raise ValueError("Relay returned an invalid photo ID")

        request = self._request(f"/display-relay/photos/{quote(photo_id)}")
        with urlopen(request, timeout=15) as response_stream:
            content_length = response_stream.headers.get("Content-Length")
            if content_length is not None and int(content_length) > MAX_RELAY_PHOTO_BYTES:
                raise ValueError("Relay photo exceeds maximum size")
            body = response_stream.read(MAX_RELAY_PHOTO_BYTES + 1)
        if len(body) > MAX_RELAY_PHOTO_BYTES:
            raise ValueError("Relay photo exceeds maximum size")

        try:
            self._uploads.ingest_relay(photo_id, body, content_type)
        except UploadRejected:
            self._json_request(
                f"/display-relay/photos/{quote(photo_id)}/reject",
                method="POST",
            )
            LOGGER.warning("Rejected invalid relay photo %s", photo_id)
            return True
        self._json_request(f"/display-relay/photos/{quote(photo_id)}/ack", method="POST")
        LOGGER.info("Downloaded and acknowledged relay photo %s", photo_id)
        return True

    def _json_request(
        self,
        path: str,
        method: str = "GET",
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = None if body is None else json.dumps(body).encode("utf-8")
        request = self._request(path, method=method, body=payload)
        with urlopen(request, timeout=10) as response:
            response_body = response.read(MAX_RELAY_RESPONSE_BYTES + 1)
        if len(response_body) > MAX_RELAY_RESPONSE_BYTES:
            raise ValueError("Relay response exceeds maximum size")
        decoded = json.loads(response_body.decode("utf-8"))
        if not isinstance(decoded, dict):
            raise ValueError("Relay response must be an object")
        return decoded

    def _request(
        self,
        path: str,
        method: str = "GET",
        body: bytes | None = None,
    ) -> Request:
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self._device_token}",
        }
        if body is not None:
            headers["Content-Type"] = "application/json"
        return Request(f"{self._base_url}{path}", data=body, headers=headers, method=method)
