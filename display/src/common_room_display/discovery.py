from __future__ import annotations

import threading

from zeroconf import IPVersion, ServiceBrowser, ServiceListener, Zeroconf

SYNC_SERVICE_TYPE = "_medlemssync._tcp.local."
DISPLAY_FEED_PATH = "/api/display/v1/feed"
MEMBER_TABLET_TYPE = "MEMBER_TABLET"


class _MemberTabletListener(ServiceListener):
    def __init__(self) -> None:
        self.feed_url: str | None = None
        self.found = threading.Event()

    def add_service(self, zeroconf: Zeroconf, service_type: str, name: str) -> None:
        info = zeroconf.get_service_info(service_type, name, timeout=1_000)
        if info is None or _property(info.properties, b"deviceType") != MEMBER_TABLET_TYPE:
            return
        addresses = info.parsed_addresses(IPVersion.V4Only)
        if addresses:
            self.feed_url = f"http://{addresses[0]}:{info.port}{DISPLAY_FEED_PATH}"
            self.found.set()

    def update_service(self, zeroconf: Zeroconf, service_type: str, name: str) -> None:
        self.add_service(zeroconf, service_type, name)

    def remove_service(self, zeroconf: Zeroconf, service_type: str, name: str) -> None:
        return


def discover_member_tablet_feed(timeout_seconds: float = 3) -> str | None:
    listener = _MemberTabletListener()
    with Zeroconf(ip_version=IPVersion.V4Only) as zeroconf:
        browser = ServiceBrowser(zeroconf, SYNC_SERVICE_TYPE, listener)
        listener.found.wait(timeout_seconds)
        browser.cancel()
    return listener.feed_url


def _property(properties: dict[bytes, bytes | None], name: bytes) -> str:
    value = properties.get(name)
    return "" if value is None else value.decode("utf-8", errors="replace")
