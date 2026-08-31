from __future__ import annotations

import io
import sqlite3
import threading
import time
import uuid
import warnings
from collections import defaultdict, deque
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from PIL import Image, ImageOps, UnidentifiedImageError

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_IMAGE_PIXELS = 20_000_000
MAX_DISPLAY_SIZE = (1920, 1080)
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


class UploadRejected(ValueError):
    pass


class UploadQuotaExceeded(RuntimeError):
    pass


@dataclass(frozen=True)
class UploadedMedia:
    id: str
    url: str
    expires_at: int


class ClientUploadLimiter:
    def __init__(self, max_uploads: int = 5, window_seconds: int = 3600) -> None:
        self._max_uploads = max_uploads
        self._window_seconds = window_seconds
        self._uploads: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def try_acquire(self, client_key: str, now: float | None = None) -> bool:
        current_time = now if now is not None else time.time()
        cutoff = current_time - self._window_seconds
        with self._lock:
            uploads = self._uploads[client_key]
            while uploads and uploads[0] <= cutoff:
                uploads.popleft()
            if len(uploads) >= self._max_uploads:
                return False
            uploads.append(current_time)
            return True


class ExpiryWorker(threading.Thread):
    def __init__(self, uploads: "UploadService", interval_seconds: int = 60) -> None:
        super().__init__(name="temporary-media-expiry", daemon=True)
        self._uploads = uploads
        self._interval_seconds = interval_seconds
        self._stopped = threading.Event()

    def run(self) -> None:
        while not self._stopped.is_set():
            self._uploads.expire()
            self._stopped.wait(self._interval_seconds)

    def stop(self) -> None:
        self._stopped.set()


class UploadService:
    def __init__(
        self,
        database_path: Path,
        media_directory: Path,
        lifetime_seconds: int,
        quota_bytes: int,
        limiter: ClientUploadLimiter | None = None,
    ) -> None:
        self._database_path = database_path
        self._media_directory = media_directory
        self._lifetime_seconds = lifetime_seconds
        self._quota_bytes = quota_bytes
        self._limiter = limiter or ClientUploadLimiter()
        database_path.parent.mkdir(parents=True, exist_ok=True)
        media_directory.mkdir(parents=True, exist_ok=True)
        self._initialize_database()

    def upload(
        self,
        body: bytes,
        content_type: str,
        client_key: str,
        now: int | None = None,
    ) -> UploadedMedia:
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise UploadRejected("Unsupported image type")
        current_time = now if now is not None else int(time.time())
        if not self._limiter.try_acquire(client_key, current_time):
            raise UploadRejected("Upload rate limit exceeded")

        processed = _process_image(body)
        self.expire(current_time)
        if self._active_size_bytes() + len(processed) > self._quota_bytes:
            raise UploadQuotaExceeded("Temporary media quota exceeded")

        media_id = uuid.uuid4().hex
        expires_at = current_time + self._lifetime_seconds
        final_path = self._media_directory / f"{media_id}.jpg"
        temporary_path = self._media_directory / f".{media_id}.tmp"
        temporary_path.write_bytes(processed)
        temporary_path.replace(final_path)
        try:
            with self._connection() as connection:
                connection.execute(
                    "INSERT INTO media (id, status, created_at, expires_at, file_size) VALUES (?, 'active', ?, ?, ?)",
                    (media_id, current_time, expires_at, len(processed)),
                )
        except Exception:
            final_path.unlink(missing_ok=True)
            raise
        return UploadedMedia(media_id, f"/media/temporary/{media_id}.jpg", expires_at)

    def active_media(self, now: int | None = None) -> list[dict[str, Any]]:
        current_time = now if now is not None else int(time.time())
        self.expire(current_time)
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT id, expires_at FROM media WHERE status = 'active' ORDER BY created_at DESC"
            ).fetchall()
        return [
            {
                "id": row[0],
                "kind": "temporary",
                "url": f"/media/temporary/{row[0]}.jpg",
                "contentType": "image/jpeg",
                "expiresAt": row[1],
            }
            for row in rows
        ]

    def resolve_active(self, media_id: str, now: int | None = None) -> Path | None:
        if len(media_id) != 32 or any(character not in "0123456789abcdef" for character in media_id):
            return None
        current_time = now if now is not None else int(time.time())
        self.expire(current_time)
        with self._connection() as connection:
            exists = connection.execute(
                "SELECT 1 FROM media WHERE id = ? AND status = 'active'", (media_id,)
            ).fetchone()
        path = self._media_directory / f"{media_id}.jpg"
        return path if exists is not None and path.is_file() else None

    def all_media(self) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT id, status, created_at, expires_at, file_size FROM media ORDER BY created_at DESC"
            ).fetchall()
        return [
            {
                "id": row[0],
                "kind": "temporary",
                "status": row[1],
                "url": f"/media/temporary/{row[0]}.jpg" if row[1] == "active" else None,
                "createdAt": row[2],
                "expiresAt": row[3],
                "fileSize": row[4],
            }
            for row in rows
        ]

    def delete(self, media_id: str) -> bool:
        if not _valid_media_id(media_id):
            return False
        with self._connection() as connection:
            result = connection.execute(
                "UPDATE media SET status = 'deleted' WHERE id = ? AND status != 'deleted'",
                (media_id,),
            )
        if result.rowcount == 0:
            return False
        (self._media_directory / f"{media_id}.jpg").unlink(missing_ok=True)
        return True

    def promote(
        self,
        media_id: str,
        permanent_directory: Path,
        now: int | None = None,
    ) -> Path | None:
        source = self.resolve_active(media_id, now)
        if source is None:
            return None
        permanent_directory.mkdir(parents=True, exist_ok=True)
        destination = permanent_directory / f"{media_id}.jpg"
        source.replace(destination)
        try:
            with self._connection() as connection:
                result = connection.execute(
                    "UPDATE media SET status = 'promoted' WHERE id = ? AND status = 'active'",
                    (media_id,),
                )
                if result.rowcount != 1:
                    raise RuntimeError("Media is no longer active")
        except Exception:
            destination.replace(source)
            raise
        return destination

    def expire(self, now: int | None = None) -> int:
        current_time = now if now is not None else int(time.time())
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT id FROM media WHERE status = 'active' AND expires_at <= ?", (current_time,)
            ).fetchall()
            connection.execute(
                "UPDATE media SET status = 'expired' WHERE status = 'active' AND expires_at <= ?",
                (current_time,),
            )
        for (media_id,) in rows:
            (self._media_directory / f"{media_id}.jpg").unlink(missing_ok=True)
        return len(rows)

    def _active_size_bytes(self) -> int:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT COALESCE(SUM(file_size), 0) FROM media WHERE status = 'active'"
            ).fetchone()
        return int(row[0])

    def _initialize_database(self) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS media (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    file_size INTEGER NOT NULL
                )
                """
            )

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self._database_path, timeout=5)
        try:
            with connection:
                yield connection
        finally:
            connection.close()


def _process_image(body: bytes) -> bytes:
    if not body:
        raise UploadRejected("Image is empty")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(body)) as source:
                if source.format not in ALLOWED_FORMATS:
                    raise UploadRejected("Unsupported decoded image type")
                source.load()
                image = ImageOps.exif_transpose(source)
                image.thumbnail(MAX_DISPLAY_SIZE, Image.Resampling.LANCZOS)
                if image.mode != "RGB":
                    background = Image.new("RGB", image.size, "white")
                    if "A" in image.getbands():
                        background.paste(image, mask=image.getchannel("A"))
                    else:
                        background.paste(image.convert("RGB"))
                    image = background
                output = io.BytesIO()
                image.save(output, format="JPEG", quality=88, optimize=True)
                return output.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise UploadRejected("Invalid or oversized image") from error


def _valid_media_id(media_id: str) -> bool:
    return len(media_id) == 32 and all(character in "0123456789abcdef" for character in media_id)
