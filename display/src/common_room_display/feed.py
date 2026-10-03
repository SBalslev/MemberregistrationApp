from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable
from urllib.request import Request, urlopen

from .config import AUTO_URL
from .discovery import discover_member_tablet_feed

LOGGER = logging.getLogger(__name__)
MAX_FEED_BYTES = 512 * 1024


class FeedCache:
    def __init__(self, cache_path: Path, stale_after_seconds: int) -> None:
        self._cache_path = cache_path
        self._stale_after_seconds = stale_after_seconds
        self._lock = threading.Lock()
        self._feed: dict[str, Any] | None = None
        self._fetched_at: float | None = None
        self._load_disk_cache()

    def update(self, feed: dict[str, Any], fetched_at: float | None = None) -> None:
        _validate_feed(feed)
        timestamp = fetched_at if fetched_at is not None else time.time()
        payload = {"fetchedAt": timestamp, "feed": feed}
        self._cache_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = self._cache_path.with_suffix(".tmp")
        temporary_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        temporary_path.replace(self._cache_path)
        with self._lock:
            self._feed = feed
            self._fetched_at = timestamp

    def snapshot(self, now: float | None = None) -> dict[str, Any]:
        current_time = now if now is not None else time.time()
        with self._lock:
            feed = self._feed
            fetched_at = self._fetched_at
        age_seconds = None if fetched_at is None else max(0, int(current_time - fetched_at))
        return {
            "available": feed is not None,
            "stale": age_seconds is None or age_seconds > self._stale_after_seconds,
            "ageSeconds": age_seconds,
            "feed": feed,
        }

    def _load_disk_cache(self) -> None:
        if not self._cache_path.exists():
            return
        try:
            payload = json.loads(self._cache_path.read_text(encoding="utf-8"))
            feed = payload["feed"]
            _validate_feed(feed)
            self._feed = feed
            self._fetched_at = float(payload["fetchedAt"])
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            LOGGER.warning("Ignoring invalid display feed cache", exc_info=True)


class FeedPoller(threading.Thread):
    def __init__(
        self,
        feed_url: str,
        interval_seconds: int,
        cache: FeedCache,
        feed_locator: Callable[[], str | None] = discover_member_tablet_feed,
    ) -> None:
        super().__init__(name="display-feed-poller", daemon=True)
        self._feed_url = feed_url
        self._resolved_feed_url: str | None = None
        self._feed_locator = feed_locator
        self._interval_seconds = interval_seconds
        self._cache = cache
        self._stopped = threading.Event()

    def run(self) -> None:
        while not self._stopped.is_set():
            try:
                self.poll_once()
            except (OSError, ValueError, json.JSONDecodeError):
                if self._feed_url == AUTO_URL:
                    self._resolved_feed_url = None
                LOGGER.warning("Unable to refresh tablet display feed", exc_info=True)
            self._stopped.wait(self._interval_seconds)

    def stop(self) -> None:
        self._stopped.set()

    def poll_once(self) -> None:
        feed_url = self._feed_url
        if feed_url == AUTO_URL:
            if self._resolved_feed_url is None:
                self._resolved_feed_url = self._feed_locator()
            if self._resolved_feed_url is None:
                raise OSError("No member tablet display feed discovered")
            LOGGER.info("Discovered member tablet display feed at %s", self._resolved_feed_url)
            feed_url = self._resolved_feed_url
        request = Request(feed_url, headers={"Accept": "application/json"})
        with urlopen(request, timeout=5) as response:
            content_length = response.headers.get("Content-Length")
            if content_length is not None and int(content_length) > MAX_FEED_BYTES:
                raise ValueError("Display feed exceeds maximum size")
            body = response.read(MAX_FEED_BYTES + 1)
        if len(body) > MAX_FEED_BYTES:
            raise ValueError("Display feed exceeds maximum size")
        feed = json.loads(body.decode("utf-8"))
        self._cache.update(feed)


def _validate_feed(feed: object) -> None:
    if not isinstance(feed, dict):
        raise ValueError("Display feed must be an object")
    if feed.get("schemaVersion") != 1:
        raise ValueError("Unsupported display feed schema version")
    for required_field in ("generatedAt", "clubDate", "stats"):
        if required_field not in feed:
            raise ValueError(f"Display feed is missing {required_field}")
