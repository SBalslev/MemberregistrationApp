#!/bin/sh
set -eu

DISPLAY_URL=http://127.0.0.1:8090/api/playlist
WIFI_DEVICE=wlan0

if ! curl --fail --silent --show-error --max-time 10 "$DISPLAY_URL" >/dev/null; then
    logger -t medlemscheckin-watchdog "Display playlist is unresponsive; restarting backend and kiosk"
    systemctl restart common-room-display.service
    systemctl restart common-room-kiosk.service
    systemctl restart --no-block common-room-kiosk-awake.service
fi

gateway=$(ip route show default dev "$WIFI_DEVICE" | awk '/default via/ { print $3; exit }')
if [ -n "$gateway" ] && ping -c 2 -W 3 "$gateway" >/dev/null 2>&1; then
    exit 0
fi

logger -t medlemscheckin-watchdog "Wi-Fi gateway is unreachable; reconnecting $WIFI_DEVICE"
nmcli device disconnect "$WIFI_DEVICE" >/dev/null 2>&1 || true
sleep 2
nmcli device connect "$WIFI_DEVICE"
