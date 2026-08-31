from __future__ import annotations

import hashlib
import mimetypes
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def discover_permanent_media(directory: Path) -> list[dict[str, Any]]:
    directory.mkdir(parents=True, exist_ok=True)
    media: list[dict[str, Any]] = []
    for path in sorted(directory.iterdir(), key=lambda item: item.name.casefold()):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        relative_name = path.name
        media.append(
            {
                "id": hashlib.sha256(relative_name.encode("utf-8")).hexdigest()[:16],
                "kind": "permanent",
                "url": f"/media/permanent/{quote(relative_name)}",
                "contentType": mimetypes.guess_type(relative_name)[0] or "application/octet-stream",
            }
        )
    return media


def resolve_media_path(directory: Path, requested_name: str) -> Path | None:
    candidate = (directory / requested_name).resolve()
    try:
        candidate.relative_to(directory.resolve())
    except ValueError:
        return None
    if not candidate.is_file() or candidate.suffix.lower() not in SUPPORTED_EXTENSIONS:
        return None
    return candidate


def delete_permanent_media(directory: Path, media_id: str) -> bool:
    for media in discover_permanent_media(directory):
        if media["id"] != media_id:
            continue
        path = resolve_media_path(directory, unquote(Path(media["url"]).name))
        if path is None:
            return False
        path.unlink()
        return True
    return False
