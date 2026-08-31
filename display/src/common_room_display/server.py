from __future__ import annotations

import argparse
import getpass
import hmac
import json
import logging
import mimetypes
from http.cookies import SimpleCookie
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

from .auth import (
    SESSION_LIFETIME_SECONDS,
    TrainerSession,
    TrainerSessionStore,
    hash_pin,
    verify_pin,
)
from .config import DisplayConfig
from .feed import FeedCache, FeedPoller
from .media import delete_permanent_media, discover_permanent_media, resolve_media_path
from .qr import generate_qr_png
from .uploads import (
    ClientUploadLimiter,
    ExpiryWorker,
    UploadQuotaExceeded,
    UploadRejected,
    UploadService,
)

LOGGER = logging.getLogger(__name__)
STATIC_DIRECTORY = Path(__file__).with_name("static")


class DisplayApplication:
    def __init__(self, config: DisplayConfig) -> None:
        self.config = config
        self.feed_cache = FeedCache(
            config.data_directory / "cache" / "display-feed.json",
            config.stale_after_seconds,
        )
        self.uploads = UploadService(
            database_path=config.data_directory / "display.db",
            media_directory=config.data_directory / "media" / "temporary",
            lifetime_seconds=config.temporary_lifetime_seconds,
            quota_bytes=config.temporary_quota_bytes,
        )
        self.trainer_sessions = TrainerSessionStore()
        self.login_limiter = ClientUploadLimiter(max_uploads=5, window_seconds=300)
        self.upload_qr_png = generate_qr_png(f"{config.public_base_url}/upload")

    def playlist(self) -> dict[str, Any]:
        return {
            "statistics": self.feed_cache.snapshot(),
            "photos": (
                self.uploads.active_media()
                + discover_permanent_media(self.config.permanent_media_directory)
            ),
        }


def create_handler(application: DisplayApplication) -> type[BaseHTTPRequestHandler]:
    class DisplayRequestHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            path = urlsplit(self.path).path
            if path == "/api/health":
                self._send_json({"status": "ok"})
            elif path == "/api/playlist":
                self._send_json(application.playlist())
            elif path == "/api/upload-qr.png":
                self._send_bytes(application.upload_qr_png, "image/png", cache_control="public, max-age=3600")
            elif path == "/api/admin/session":
                session = self._trainer_session()
                if session is None:
                    self._send_json({"authenticated": False})
                else:
                    self._send_json({"authenticated": True, "csrfToken": session.csrf_token})
            elif path == "/api/admin/media":
                if self._require_trainer_session() is not None:
                    self._send_json(
                        {
                            "temporary": application.uploads.all_media(),
                            "permanent": discover_permanent_media(
                                application.config.permanent_media_directory
                            ),
                        }
                    )
            elif path.startswith("/media/permanent/"):
                requested_name = unquote(path.removeprefix("/media/permanent/"))
                media_path = resolve_media_path(
                    application.config.permanent_media_directory, requested_name
                )
                if media_path is None:
                    self.send_error(HTTPStatus.NOT_FOUND)
                else:
                    self._send_file(media_path)
            elif path.startswith("/media/temporary/"):
                requested_name = unquote(path.removeprefix("/media/temporary/"))
                media_id = requested_name.removesuffix(".jpg")
                media_path = application.uploads.resolve_active(media_id)
                if media_path is None:
                    self.send_error(HTTPStatus.NOT_FOUND)
                else:
                    self._send_file(media_path, "image/jpeg")
            elif path in ("/", "/index.html"):
                self._send_file(STATIC_DIRECTORY / "index.html", "text/html; charset=utf-8")
            elif path == "/upload":
                self._send_file(STATIC_DIRECTORY / "upload.html", "text/html; charset=utf-8")
            elif path == "/admin":
                self._send_file(STATIC_DIRECTORY / "admin.html", "text/html; charset=utf-8")
            else:
                self.send_error(HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:
            path = urlsplit(self.path).path
            if path == "/api/admin/login":
                self._login()
                return
            if path == "/api/admin/logout":
                session = self._require_trainer_session(require_csrf=True)
                if session is not None:
                    application.trainer_sessions.delete(session.token)
                    self._send_json(
                        {"authenticated": False},
                        extra_headers={"Set-Cookie": _expired_session_cookie()},
                    )
                return
            promote_prefix = "/api/admin/media/temporary/"
            if path.startswith(promote_prefix) and path.endswith("/promote"):
                if self._require_trainer_session(require_csrf=True) is None:
                    return
                media_id = path.removeprefix(promote_prefix).removesuffix("/promote")
                promoted = application.uploads.promote(
                    media_id,
                    application.config.permanent_media_directory,
                )
                if promoted is None:
                    self.send_error(HTTPStatus.NOT_FOUND)
                else:
                    self._send_json({"promoted": True})
                return
            if path != "/api/uploads":
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            content_length = self.headers.get("Content-Length")
            if content_length is None:
                self.send_error(HTTPStatus.LENGTH_REQUIRED)
                return
            try:
                body_length = int(content_length)
            except ValueError:
                self.send_error(HTTPStatus.BAD_REQUEST)
                return
            if body_length <= 0 or body_length > application.config.max_upload_bytes:
                self.send_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
                return
            content_type = self.headers.get_content_type()
            body = self.rfile.read(body_length)
            try:
                uploaded = application.uploads.upload(
                    body=body,
                    content_type=content_type,
                    client_key=self.client_address[0],
                )
            except UploadRejected as error:
                status = HTTPStatus.TOO_MANY_REQUESTS if "rate limit" in str(error) else HTTPStatus.BAD_REQUEST
                self._send_json({"error": str(error)}, status)
                return
            except UploadQuotaExceeded as error:
                self._send_json({"error": str(error)}, HTTPStatus.INSUFFICIENT_STORAGE)
                return
            self._send_json(
                {"id": uploaded.id, "url": uploaded.url, "expiresAt": uploaded.expires_at},
                HTTPStatus.CREATED,
            )

        def do_DELETE(self) -> None:
            path = urlsplit(self.path).path
            if self._require_trainer_session(require_csrf=True) is None:
                return
            temporary_prefix = "/api/admin/media/temporary/"
            permanent_prefix = "/api/admin/media/permanent/"
            if path.startswith(temporary_prefix):
                deleted = application.uploads.delete(path.removeprefix(temporary_prefix))
            elif path.startswith(permanent_prefix):
                deleted = delete_permanent_media(
                    application.config.permanent_media_directory,
                    path.removeprefix(permanent_prefix),
                )
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            if deleted:
                self._send_json({"deleted": True})
            else:
                self.send_error(HTTPStatus.NOT_FOUND)

        def _login(self) -> None:
            if not application.config.trainer_pin_hash:
                self._send_json({"error": "Trainer PIN is not configured"}, HTTPStatus.SERVICE_UNAVAILABLE)
                return
            if not application.login_limiter.try_acquire(self.client_address[0]):
                self._send_json({"error": "Too many login attempts"}, HTTPStatus.TOO_MANY_REQUESTS)
                return
            payload = self._read_json()
            if payload is None:
                return
            if not verify_pin(str(payload.get("pin", "")), application.config.trainer_pin_hash):
                self._send_json({"error": "Invalid trainer PIN"}, HTTPStatus.UNAUTHORIZED)
                return
            session = application.trainer_sessions.create()
            self._send_json(
                {"authenticated": True, "csrfToken": session.csrf_token},
                extra_headers={"Set-Cookie": _session_cookie(session)},
            )

        def _read_json(self) -> dict[str, Any] | None:
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self.send_error(HTTPStatus.BAD_REQUEST)
                return None
            if content_length <= 0 or content_length > 4096:
                self.send_error(HTTPStatus.BAD_REQUEST)
                return None
            try:
                payload = json.loads(self.rfile.read(content_length))
            except (json.JSONDecodeError, UnicodeDecodeError):
                self.send_error(HTTPStatus.BAD_REQUEST)
                return None
            if not isinstance(payload, dict):
                self.send_error(HTTPStatus.BAD_REQUEST)
                return None
            return payload

        def _require_trainer_session(self, require_csrf: bool = False) -> TrainerSession | None:
            session = self._trainer_session()
            if session is None:
                self._send_json({"error": "Trainer authentication required"}, HTTPStatus.UNAUTHORIZED)
                return None
            if require_csrf and not hmac.compare_digest(
                self.headers.get("X-CSRF-Token", ""), session.csrf_token
            ):
                self._send_json({"error": "Invalid CSRF token"}, HTTPStatus.FORBIDDEN)
                return None
            return session

        def _trainer_session(self) -> TrainerSession | None:
            cookie = SimpleCookie(self.headers.get("Cookie"))
            token = cookie.get("trainer_session")
            return application.trainer_sessions.get(token.value if token else None)

        def _send_json(
            self,
            payload: object,
            status: HTTPStatus = HTTPStatus.OK,
            extra_headers: dict[str, str] | None = None,
        ) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for name, value in (extra_headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(body)

        def _send_file(self, path: Path, content_type: str | None = None) -> None:
            try:
                body = path.read_bytes()
            except OSError:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            self._send_bytes(
                body,
                content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream",
            )

        def _send_bytes(self, body: bytes, content_type: str, cache_control: str = "no-cache") -> None:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", cache_control)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format_string: str, *args: object) -> None:
            LOGGER.info("%s - %s", self.address_string(), format_string % args)

    return DisplayRequestHandler


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the common-room display service")
    parser.add_argument("--config", type=Path, default=Path("config.json"))
    parser.add_argument("--hash-pin", action="store_true", help="Generate a trainerPinHash value")
    args = parser.parse_args()
    if args.hash_pin:
        pin = getpass.getpass("Trainer PIN: ")
        confirmation = getpass.getpass("Repeat trainer PIN: ")
        if pin != confirmation:
            parser.error("PIN values do not match")
        print(hash_pin(pin))
        return
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    config = DisplayConfig.load(args.config)
    config.data_directory.mkdir(parents=True, exist_ok=True)
    application = DisplayApplication(config)
    poller = FeedPoller(config.tablet_feed_url, config.poll_interval_seconds, application.feed_cache)
    expiry_worker = ExpiryWorker(application.uploads)
    poller.start()
    expiry_worker.start()
    server = ThreadingHTTPServer((config.bind_host, config.bind_port), create_handler(application))
    LOGGER.info("Common-room display listening on http://%s:%s", config.bind_host, config.bind_port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        poller.stop()
        expiry_worker.stop()
        poller.join(timeout=2)
        expiry_worker.join(timeout=2)
        server.server_close()


def _session_cookie(session: TrainerSession) -> str:
    return (
        f"trainer_session={session.token}; HttpOnly; SameSite=Strict; Path=/; "
        f"Max-Age={SESSION_LIFETIME_SECONDS}"
    )


def _expired_session_cookie() -> str:
    return "trainer_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"


if __name__ == "__main__":
    main()
