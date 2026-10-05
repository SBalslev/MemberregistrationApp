from __future__ import annotations

import io
import json
import tempfile
import threading
import unittest
from http.cookiejar import CookieJar
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

from PIL import Image

from common_room_display.auth import TrainerSessionStore, hash_pin, verify_pin
from common_room_display.config import DisplayConfig
from common_room_display.feed import FeedCache, FeedPoller
from common_room_display.media import delete_permanent_media, discover_permanent_media, resolve_media_path
from common_room_display.relay import DisplayRelayClient
from common_room_display.server import DisplayApplication, create_handler
from common_room_display.uploads import ClientUploadLimiter, ExpiryWorker, UploadRejected, UploadService


class DisplayConfigTest(unittest.TestCase):
    def test_load_resolves_relative_directories(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_path = root / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "publicBaseUrl": "http://display.local:8090",
                        "tabletFeedUrl": "http://tablet:8085/api/display/v1/feed",
                    }
                ),
                encoding="utf-8",
            )

            config = DisplayConfig.load(config_path)

            self.assertEqual(root / "data", config.data_directory)
            self.assertEqual(root / "data/media/permanent", config.permanent_media_directory)

    def test_load_resolves_auto_public_url_from_hostname(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "config.json"
            config_path.write_text("{}", encoding="utf-8")

            with patch(
                "common_room_display.config.socket.gethostname",
                return_value="club-display",
            ):
                config = DisplayConfig.load(config_path)

            self.assertEqual("http://club-display.local:8090", config.public_base_url)
            self.assertEqual("auto", config.tablet_feed_url)

    def test_relay_url_and_token_must_be_configured_together(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "config.json"
            config_path.write_text(
                json.dumps({"relayBaseUrl": "https://iss-skydning.dk/api/v1"}),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "configured together"):
                DisplayConfig.load(config_path)


class FeedCacheTest(unittest.TestCase):
    def test_cache_survives_restart_and_becomes_stale(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "feed.json"
            feed = {
                "schemaVersion": 1,
                "generatedAt": "2026-08-31T18:00:00Z",
                "clubDate": "2026-08-31",
                "stats": {"participantCount": 2, "sessionCount": 3, "totalPoints": 500},
            }
            FeedCache(cache_path, stale_after_seconds=300).update(feed, fetched_at=1_000)

            fresh_cache = FeedCache(cache_path, stale_after_seconds=300)

            self.assertFalse(fresh_cache.snapshot(now=1_299)["stale"])
            self.assertTrue(fresh_cache.snapshot(now=1_301)["stale"])
            self.assertEqual(feed, fresh_cache.snapshot(now=1_301)["feed"])

    def test_invalid_cache_is_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "feed.json"
            cache_path.write_text("not-json", encoding="utf-8")

            snapshot = FeedCache(cache_path, stale_after_seconds=300).snapshot()

            self.assertFalse(snapshot["available"])
            self.assertTrue(snapshot["stale"])

    def test_poller_uses_discovered_member_tablet_feed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache = FeedCache(Path(directory) / "feed.json", stale_after_seconds=300)
            feed = {
                "schemaVersion": 1,
                "generatedAt": "2026-09-15T15:30:00Z",
                "clubDate": "2026-09-15",
                "stats": {},
            }
            response = io.BytesIO(json.dumps(feed).encode("utf-8"))
            response.headers = {}
            poller = FeedPoller(
                "auto",
                interval_seconds=15,
                cache=cache,
                feed_locator=lambda: "http://member-tablet:8085/api/display/v1/feed",
            )

            with patch("common_room_display.feed.urlopen", return_value=response) as open_feed:
                poller.poll_once()

            self.assertEqual(
                "http://member-tablet:8085/api/display/v1/feed",
                open_feed.call_args.args[0].full_url,
            )
            self.assertEqual(feed, cache.snapshot()["feed"])


class PermanentMediaTest(unittest.TestCase):
    def test_discovers_supported_media_and_rejects_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            media_directory = Path(directory) / "media"
            media_directory.mkdir()
            (media_directory / "club photo.jpg").write_bytes(b"image")
            (media_directory / "notes.txt").write_text("not media", encoding="utf-8")

            media = discover_permanent_media(media_directory)

            self.assertEqual(1, len(media))
            self.assertEqual("/media/permanent/club%20photo.jpg", media[0]["url"])
            self.assertEqual(media_directory / "club photo.jpg", resolve_media_path(media_directory, "club photo.jpg"))
            self.assertIsNone(resolve_media_path(media_directory, "../outside.jpg"))

    def test_deletes_permanent_media_by_public_id(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            media_directory = Path(directory)
            media_path = media_directory / "club photo.jpg"
            media_path.write_bytes(b"image")
            media_id = discover_permanent_media(media_directory)[0]["id"]

            self.assertTrue(delete_permanent_media(media_directory, media_id))
            self.assertFalse(media_path.exists())
            self.assertFalse(delete_permanent_media(media_directory, media_id))


class TrainerAuthTest(unittest.TestCase):
    def test_hash_verifies_only_matching_pin(self) -> None:
        encoded = hash_pin("2468", salt=bytes.fromhex("00112233445566778899aabbccddeeff"))

        self.assertTrue(verify_pin("2468", encoded))
        self.assertFalse(verify_pin("1357", encoded))
        self.assertFalse(verify_pin("2468", "invalid"))

    def test_session_expires(self) -> None:
        sessions = TrainerSessionStore(lifetime_seconds=60)
        session = sessions.create(now=1_000)

        self.assertEqual(session, sessions.get(session.token, now=1_059))
        self.assertIsNone(sessions.get(session.token, now=1_060))


class UploadServiceTest(unittest.TestCase):
    def test_upload_reencodes_resizes_and_removes_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = UploadService(root / "display.db", root / "temporary", 14_400, 10_000_000)
            source = Image.new("RGB", (2400, 1200), "red")
            exif = Image.Exif()
            exif[0x010E] = "private description"
            input_bytes = io.BytesIO()
            source.save(input_bytes, format="JPEG", exif=exif)

            uploaded = service.upload(input_bytes.getvalue(), "image/jpeg", "client-1", now=1_000)
            output_path = service.resolve_active(uploaded.id, now=1_001)

            self.assertIsNotNone(output_path)
            with Image.open(output_path) as processed:
                self.assertEqual("JPEG", processed.format)
                self.assertLessEqual(processed.width, 1920)
                self.assertLessEqual(processed.height, 1080)
                self.assertEqual(0, len(processed.getexif()))
            self.assertEqual(15_400, uploaded.expires_at)

    def test_expire_removes_file_and_playlist_entry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = UploadService(root / "display.db", root / "temporary", 100, 10_000_000)
            uploaded = service.upload(_jpeg_bytes(), "image/jpeg", "client-1", now=1_000)

            expired_count = service.expire(now=1_100)

            self.assertEqual(1, expired_count)
            self.assertEqual([], service.active_media(now=1_100))
            self.assertIsNone(service.resolve_active(uploaded.id, now=1_100))

    def test_client_limiter_rejects_sixth_upload_within_hour(self) -> None:
        limiter = ClientUploadLimiter(max_uploads=5, window_seconds=3600)

        for offset in range(5):
            self.assertTrue(limiter.try_acquire("client", now=1_000 + offset))
        self.assertFalse(limiter.try_acquire("client", now=2_000))
        self.assertTrue(limiter.try_acquire("client", now=4_600))

    def test_rejects_non_image_body(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = UploadService(root / "display.db", root / "temporary", 100, 10_000_000)

            with self.assertRaises(UploadRejected):
                service.upload(b"not-an-image", "image/jpeg", "client-1", now=1_000)

    def test_delete_removes_active_media(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = UploadService(root / "display.db", root / "temporary", 100, 10_000_000)
            uploaded = service.upload(_jpeg_bytes(), "image/jpeg", "client-1", now=1_000)

            self.assertTrue(service.delete(uploaded.id))
            self.assertIsNone(service.resolve_active(uploaded.id, now=1_001))
            self.assertEqual("deleted", service.all_media()[0]["status"])
            self.assertFalse(service.delete(uploaded.id))

    def test_promote_moves_temporary_media_to_permanent_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            permanent = root / "permanent"
            service = UploadService(root / "display.db", root / "temporary", 100, 10_000_000)
            uploaded = service.upload(_jpeg_bytes(), "image/jpeg", "client-1", now=1_000)

            promoted = service.promote(uploaded.id, permanent, now=1_001)

            self.assertEqual(permanent / f"{uploaded.id}.jpg", promoted)
            self.assertTrue(promoted.is_file())
            self.assertIsNone(service.resolve_active(uploaded.id, now=1_001))
            self.assertEqual("promoted", service.all_media()[0]["status"])

    def test_relay_ingest_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = UploadService(root / "display.db", root / "temporary", 100, 10_000_000)
            media_id = "0123456789abcdef0123456789abcdef"

            first = service.ingest_relay(media_id, _jpeg_bytes(), "image/jpeg", now=1_000)
            second = service.ingest_relay(media_id, _jpeg_bytes(), "image/jpeg", now=1_001)

            self.assertEqual(first, second)
            self.assertEqual(1, len(service.active_media(now=1_001)))

    def test_expiry_worker_runs_cleanup_until_stopped(self) -> None:
        cleanup_ran = threading.Event()

        class StubUploads:
            def expire(self) -> int:
                cleanup_ran.set()
                return 0

        worker = ExpiryWorker(StubUploads(), interval_seconds=60)
        worker.start()
        self.assertTrue(cleanup_ran.wait(timeout=1))
        worker.stop()
        worker.join(timeout=1)
        self.assertFalse(worker.is_alive())


class DisplayHttpTest(unittest.TestCase):
    def test_serves_health_playlist_kiosk_and_permanent_media(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            media_directory = root / "media"
            media_directory.mkdir()
            (media_directory / "club.jpg").write_bytes(b"test-image")
            config = DisplayConfig(
                bind_host="127.0.0.1",
                bind_port=0,
                public_base_url="http://display.local:8090",
                tablet_feed_url="http://tablet:8085/api/display/v1/feed",
                poll_interval_seconds=15,
                stale_after_seconds=300,
                data_directory=root / "data",
                permanent_media_directory=media_directory,
            )
            application = DisplayApplication(config)
            server = ThreadingHTTPServer(("127.0.0.1", 0), create_handler(application))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base_url = f"http://127.0.0.1:{server.server_port}"
            try:
                with urlopen(f"{base_url}/api/health") as response:
                    self.assertEqual({"status": "ok"}, json.load(response))
                with urlopen(f"{base_url}/api/playlist") as response:
                    playlist = json.load(response)
                    self.assertFalse(playlist["statistics"]["available"])
                    self.assertEqual("/media/permanent/club.jpg", playlist["photos"][0]["url"])
                with urlopen(f"{base_url}/api/upload-qr.png") as response:
                    self.assertEqual("image/png", response.headers.get_content_type())
                    self.assertTrue(response.read().startswith(b"\x89PNG"))
                with urlopen(f"{base_url}/") as response:
                    kiosk = response.read()
                    self.assertIn(b"ISS Sportsskytter", kiosk)
                    self.assertIn(b'grid-template-columns', kiosk)
                    self.assertIn(b'topScoresByDiscipline', kiosk)
                    self.assertNotIn(b'topScoresByDiscipline.slice(0, 2)', kiosk)
                    self.assertIn(b'feed.activity?.title', kiosk)
                    self.assertIn(b'entry.affiliation', kiosk)
                with urlopen(f"{base_url}/media/permanent/club.jpg") as response:
                    self.assertEqual(b"test-image", response.read())
                upload_request = Request(
                    f"{base_url}/api/uploads",
                    data=_jpeg_bytes(),
                    headers={"Content-Type": "image/jpeg"},
                    method="POST",
                )
                with urlopen(upload_request) as response:
                    uploaded = json.load(response)
                    self.assertEqual(201, response.status)
                with urlopen(f"{base_url}{uploaded['url']}") as response:
                    self.assertEqual("image/jpeg", response.headers.get_content_type())
                    self.assertGreater(len(response.read()), 0)
                with self.assertRaises(HTTPError) as error:
                    urlopen(f"{base_url}/media/permanent/%2e%2e/outside.jpg")
                self.assertEqual(404, error.exception.code)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

    def test_trainer_moderation_requires_login_and_csrf(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = DisplayConfig(
                bind_host="127.0.0.1",
                bind_port=0,
                public_base_url="http://display.local:8090",
                tablet_feed_url="http://tablet:8085/api/display/v1/feed",
                poll_interval_seconds=15,
                stale_after_seconds=300,
                data_directory=root / "data",
                permanent_media_directory=root / "permanent",
                trainer_pin_hash=hash_pin("2468"),
            )
            application = DisplayApplication(config)
            server = ThreadingHTTPServer(("127.0.0.1", 0), create_handler(application))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base_url = f"http://127.0.0.1:{server.server_port}"
            opener = build_opener(HTTPCookieProcessor(CookieJar()))
            try:
                with self.assertRaises(HTTPError) as unauthenticated:
                    opener.open(f"{base_url}/api/admin/media")
                self.assertEqual(401, unauthenticated.exception.code)

                login_request = Request(
                    f"{base_url}/api/admin/login",
                    data=json.dumps({"pin": "2468"}).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with opener.open(login_request) as response:
                    csrf_token = json.load(response)["csrfToken"]

                upload_request = Request(
                    f"{base_url}/api/uploads",
                    data=_jpeg_bytes(),
                    headers={"Content-Type": "image/jpeg"},
                    method="POST",
                )
                with opener.open(upload_request) as response:
                    media_id = json.load(response)["id"]

                invalid_csrf_request = Request(
                    f"{base_url}/api/admin/media/temporary/{media_id}",
                    headers={"X-CSRF-Token": "invalid"},
                    method="DELETE",
                )
                with self.assertRaises(HTTPError) as invalid_csrf:
                    opener.open(invalid_csrf_request)
                self.assertEqual(403, invalid_csrf.exception.code)

                promote_request = Request(
                    f"{base_url}/api/admin/media/temporary/{media_id}/promote",
                    data=b"",
                    headers={"X-CSRF-Token": csrf_token},
                    method="POST",
                )
                with opener.open(promote_request) as response:
                    self.assertTrue(json.load(response)["promoted"])

                with opener.open(f"{base_url}/api/admin/media") as response:
                    media = json.load(response)
                self.assertEqual("promoted", media["temporary"][0]["status"])
                permanent_id = media["permanent"][0]["id"]

                delete_request = Request(
                    f"{base_url}/api/admin/media/permanent/{permanent_id}",
                    headers={"X-CSRF-Token": csrf_token},
                    method="DELETE",
                )
                with opener.open(delete_request) as response:
                    self.assertTrue(json.load(response)["deleted"])
                self.assertEqual([], discover_permanent_media(config.permanent_media_directory))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)


class DisplayRelayClientTest(unittest.TestCase):
    def test_rotates_invitation_downloads_photo_and_acknowledges(self) -> None:
        media_id = "fedcba9876543210fedcba9876543210"
        image = _jpeg_bytes()
        acknowledged = threading.Event()
        invitation_count = [0]

        class RelayHandler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                if self.headers.get("Authorization") != "Bearer device-secret":
                    self.send_error(401)
                    return
                if self.path == "/display-relay/invitations":
                    invitation_count[0] += 1
                    self._json(
                        {
                            "upload_url": "https://iss-skydning.dk/api/v1/display-relay/upload#token",
                            "expires_at": "2030-09-15T19:00:00+00:00",
                        },
                        201,
                    )
                elif self.path == f"/display-relay/photos/{media_id}/ack":
                    acknowledged.set()
                    self._json({"acknowledged": True})
                else:
                    self.send_error(404)

            def do_GET(self) -> None:
                if self.headers.get("Authorization") != "Bearer device-secret":
                    self.send_error(401)
                    return
                if self.path.startswith("/display-relay/photos/next?"):
                    photo = None if acknowledged.is_set() else {
                        "id": media_id,
                        "mime_type": "image/jpeg",
                        "file_size": len(image),
                    }
                    self._json({"photo": photo})
                elif self.path == f"/display-relay/photos/{media_id}":
                    self.send_response(200)
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", str(len(image)))
                    self.end_headers()
                    self.wfile.write(image)
                else:
                    self.send_error(404)

            def log_message(self, format: str, *args: object) -> None:
                return

            def _json(self, body: dict[str, object], status: int = 200) -> None:
                encoded = json.dumps(body).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            uploads = UploadService(root / "display.db", root / "temporary", 14_400, 10_000_000)
            server = ThreadingHTTPServer(("127.0.0.1", 0), RelayHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            relay = DisplayRelayClient(
                f"http://127.0.0.1:{server.server_port}",
                "device-secret",
                "club-display",
                15,
                uploads,
                "http://club-display.local:8090/upload",
            )
            try:
                relay.poll_once(now=1_000)
                relay.poll_once(now=4_299)

                self.assertTrue(acknowledged.is_set())
                self.assertEqual(1, invitation_count[0])
                self.assertEqual(
                    "https://iss-skydning.dk/api/v1/display-relay/upload#token",
                    relay.upload_url,
                )
                self.assertEqual(media_id, uploads.active_media(now=1_001)[0]["id"])
                relay.poll_once(now=4_300)
                self.assertEqual(2, invitation_count[0])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

    def test_rejects_poison_photo_and_advances_queue(self) -> None:
        media_id = "abcdef0123456789abcdef0123456789"
        rejected = threading.Event()

        class InvalidRelayHandler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                if self.path == "/display-relay/invitations":
                    self._json({
                        "upload_url": "https://example.test/upload#token",
                        "expires_at": "2030-09-15T19:00:00+00:00",
                    })
                elif self.path == f"/display-relay/photos/{media_id}/reject":
                    rejected.set()
                    self._json({"rejected": True})
                else:
                    self.send_error(404)

            def do_GET(self) -> None:
                if self.path.startswith("/display-relay/photos/next?"):
                    photo = None if rejected.is_set() else {
                        "id": media_id,
                        "mime_type": "image/jpeg",
                        "file_size": 12,
                    }
                    self._json({"photo": photo})
                elif self.path == f"/display-relay/photos/{media_id}":
                    body = b"not-an-image"
                    self.send_response(200)
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                else:
                    self.send_error(404)

            def log_message(self, format: str, *args: object) -> None:
                return

            def _json(self, body: dict[str, object]) -> None:
                encoded = json.dumps(body).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            uploads = UploadService(root / "display.db", root / "temporary", 14_400, 10_000_000)
            server = ThreadingHTTPServer(("127.0.0.1", 0), InvalidRelayHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            relay = DisplayRelayClient(
                f"http://127.0.0.1:{server.server_port}",
                "device-secret",
                "club-display",
                15,
                uploads,
                "http://club-display.local:8090/upload",
            )
            try:
                relay.poll_once(now=1_000)

                self.assertTrue(rejected.is_set())
                self.assertEqual([], uploads.active_media(now=1_001))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

    def test_expired_invitation_falls_back_to_local_upload(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            relay = DisplayRelayClient(
                "https://iss-skydning.dk/api/v1",
                "device-secret",
                "club-display",
                15,
                UploadService(root / "display.db", root / "temporary", 14_400, 10_000_000),
                "http://club-display.local:8090/upload",
            )
            relay._upload_url = "https://iss-skydning.dk/api/v1/display-relay/upload#expired"
            relay._invitation_expires_at = 1_000

            relay._use_fallback_if_expired(now=1_001)

            self.assertEqual("http://club-display.local:8090/upload", relay.upload_url)


class DeploymentAssetsTest(unittest.TestCase):
    def test_installer_enables_playlist_and_wifi_watchdog(self) -> None:
        display_root = Path(__file__).resolve().parents[1]
        installer = (display_root / "deploy" / "install.sh").read_text(encoding="utf-8")
        watchdog = (display_root / "deploy" / "common-room-watchdog.sh").read_text(
            encoding="utf-8"
        )
        watchdog_bytes = (display_root / "deploy" / "common-room-watchdog.sh").read_bytes()

        self.assertIn("systemctl enable --now common-room-watchdog.timer", installer)
        self.assertIn("/api/playlist", watchdog)
        self.assertIn("systemctl restart common-room-kiosk.service", watchdog)
        self.assertIn("nmcli device connect", watchdog)
        self.assertNotIn(b"\r\n", watchdog_bytes)


def _jpeg_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (32, 24), "blue").save(output, format="JPEG")
    return output.getvalue()


if __name__ == "__main__":
    unittest.main()