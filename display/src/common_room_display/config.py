from __future__ import annotations

import json
import socket
from dataclasses import dataclass
from pathlib import Path
from typing import Any

AUTO_URL = "auto"


@dataclass(frozen=True)
class DisplayConfig:
    bind_host: str
    bind_port: int
    public_base_url: str
    tablet_feed_url: str
    poll_interval_seconds: int
    stale_after_seconds: int
    data_directory: Path
    permanent_media_directory: Path
    trainer_pin_hash: str = ""
    temporary_lifetime_seconds: int = 14_400
    max_upload_bytes: int = 10 * 1024 * 1024
    temporary_quota_bytes: int = 512 * 1024 * 1024
    relay_base_url: str = ""
    relay_device_token: str = ""
    relay_display_id: str = ""
    relay_poll_interval_seconds: int = 15

    @classmethod
    def load(cls, path: Path) -> "DisplayConfig":
        raw: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
        base_directory = path.resolve().parent
        data_directory = _resolve_path(base_directory, raw.get("dataDirectory", "data"))
        media_directory = _resolve_path(
            base_directory,
            raw.get("permanentMediaDirectory", "data/media/permanent"),
        )
        bind_port = _bounded_int(raw.get("bindPort", 8090), "bindPort", 1, 65535)
        poll_interval = _bounded_int(
            raw.get("pollIntervalSeconds", 15), "pollIntervalSeconds", 5, 3600
        )
        stale_after = _bounded_int(
            raw.get("staleAfterSeconds", 300), "staleAfterSeconds", poll_interval, 86400
        )
        temporary_lifetime = _bounded_int(
            raw.get("temporaryLifetimeSeconds", 14_400),
            "temporaryLifetimeSeconds",
            300,
            86_400,
        )
        max_upload_bytes = _bounded_int(
            raw.get("maxUploadBytes", 10 * 1024 * 1024),
            "maxUploadBytes",
            1024,
            25 * 1024 * 1024,
        )
        temporary_quota_bytes = _bounded_int(
            raw.get("temporaryQuotaBytes", 512 * 1024 * 1024),
            "temporaryQuotaBytes",
            max_upload_bytes,
            10 * 1024 * 1024 * 1024,
        )
        tablet_feed_url = _configured_url(raw.get("tabletFeedUrl", AUTO_URL), "tabletFeedUrl")
        public_base_url = _configured_url(raw.get("publicBaseUrl", AUTO_URL), "publicBaseUrl")
        if public_base_url == AUTO_URL:
            public_base_url = f"http://{socket.gethostname().split('.')[0]}.local:{bind_port}"
        relay_base_url = str(raw.get("relayBaseUrl", "")).strip().rstrip("/")
        relay_device_token = str(raw.get("relayDeviceToken", "")).strip()
        if bool(relay_base_url) != bool(relay_device_token):
            raise ValueError("relayBaseUrl and relayDeviceToken must be configured together")
        if relay_base_url and not relay_base_url.startswith("https://"):
            raise ValueError("relayBaseUrl must use https://")
        relay_display_id = str(
            raw.get("relayDisplayId", socket.gethostname().split(".")[0])
        ).strip()
        if not relay_display_id or any(
            character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
            for character in relay_display_id
        ):
            raise ValueError("relayDisplayId may contain only letters, digits, underscores, and hyphens")
        relay_poll_interval = _bounded_int(
            raw.get("relayPollIntervalSeconds", 15),
            "relayPollIntervalSeconds",
            5,
            300,
        )

        return cls(
            bind_host=str(raw.get("bindHost", "0.0.0.0")),
            bind_port=bind_port,
            public_base_url=public_base_url,
            tablet_feed_url=tablet_feed_url,
            poll_interval_seconds=poll_interval,
            stale_after_seconds=stale_after,
            data_directory=data_directory,
            permanent_media_directory=media_directory,
            trainer_pin_hash=str(raw.get("trainerPinHash", "")).strip(),
            temporary_lifetime_seconds=temporary_lifetime,
            max_upload_bytes=max_upload_bytes,
            temporary_quota_bytes=temporary_quota_bytes,
            relay_base_url=relay_base_url,
            relay_device_token=relay_device_token,
            relay_display_id=relay_display_id,
            relay_poll_interval_seconds=relay_poll_interval,
        )


def _resolve_path(base_directory: Path, value: object) -> Path:
    path = Path(str(value))
    return path if path.is_absolute() else base_directory / path


def _configured_url(value: object, name: str) -> str:
    configured = str(value).strip().rstrip("/")
    if configured != AUTO_URL and not configured.startswith(("http://", "https://")):
        raise ValueError(f"{name} must be 'auto' or use http:// or https://")
    return configured


def _bounded_int(value: object, name: str, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{name} must be an integer") from error
    if not minimum <= parsed <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return parsed
