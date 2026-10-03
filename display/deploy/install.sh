#!/bin/sh
set -eu

SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
INSTALL_DIR=/opt/medlemscheckin-display
CONFIG_DIR=/etc/medlemscheckin-display
DATA_DIR=/var/lib/medlemscheckin-display
LIBEXEC_DIR=/usr/local/lib/medlemscheckin-display
SERVICE_USER=display

if [ "$(id -u)" -ne 0 ]; then
    echo "Run this installer as root." >&2
    exit 1
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash "$SERVICE_USER"
fi

apt-get update
if apt-cache show chromium 2>/dev/null | grep -q '^Package:'; then
    CHROMIUM_PACKAGE=chromium
    CHROMIUM_BINARY=/usr/bin/chromium
else
    CHROMIUM_PACKAGE=chromium-browser
    CHROMIUM_BINARY=/usr/bin/chromium-browser
fi
apt-get install --yes avahi-daemon curl iproute2 iputils-ping network-manager python3 python3-venv xserver-xorg xinit x11-xserver-utils "$CHROMIUM_PACKAGE"

for group in video input render; do
    if getent group "$group" >/dev/null 2>&1; then
        usermod --append --groups "$group" "$SERVICE_USER"
    fi
done

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR/media/permanent" "$LIBEXEC_DIR"
cp -R "$SOURCE_DIR/src" "$SOURCE_DIR/pyproject.toml" "$INSTALL_DIR/"
cp "$SOURCE_DIR/deploy/start-kiosk.sh" "$LIBEXEC_DIR/start-kiosk.sh"
cp "$SOURCE_DIR/deploy/common-room-watchdog.sh" "$LIBEXEC_DIR/common-room-watchdog.sh"
rm -f /etc/X11/xorg.conf.d/10-common-room-display.conf
chmod 0755 "$LIBEXEC_DIR/start-kiosk.sh" "$LIBEXEC_DIR/common-room-watchdog.sh"
ln -sfn "$CHROMIUM_BINARY" /usr/local/bin/medlemscheckin-chromium
python3 -m venv "$INSTALL_DIR/.venv"
"$INSTALL_DIR/.venv/bin/python" -m pip install --upgrade pip
"$INSTALL_DIR/.venv/bin/python" -m pip install "$INSTALL_DIR"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
    cp "$SOURCE_DIR/config.example.json" "$CONFIG_DIR/config.json"
    sed -i \
        -e "s#\"dataDirectory\": \"data\"#\"dataDirectory\": \"$DATA_DIR\"#" \
        -e "s#\"permanentMediaDirectory\": \"data/media/permanent\"#\"permanentMediaDirectory\": \"$DATA_DIR/media/permanent\"#" \
        "$CONFIG_DIR/config.json"
fi

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" "$DATA_DIR"
chown root:"$SERVICE_USER" "$CONFIG_DIR" "$CONFIG_DIR/config.json"
chmod 0750 "$CONFIG_DIR"
chmod 0640 "$CONFIG_DIR/config.json"

cp "$SOURCE_DIR/deploy/common-room-display.service" /etc/systemd/system/
cp "$SOURCE_DIR/deploy/common-room-kiosk.service" /etc/systemd/system/
cp "$SOURCE_DIR/deploy/common-room-kiosk-awake.service" /etc/systemd/system/
cp "$SOURCE_DIR/deploy/common-room-watchdog.service" /etc/systemd/system/
cp "$SOURCE_DIR/deploy/common-room-watchdog.timer" /etc/systemd/system/
mkdir -p /var/log/journal
systemd-tmpfiles --create --prefix /var/log/journal
systemctl restart systemd-journald.service
systemctl daemon-reload
if systemctl cat lightdm.service >/dev/null 2>&1; then
    systemctl disable --now lightdm.service
fi
systemctl enable --now avahi-daemon.service
systemctl enable common-room-display.service common-room-kiosk.service common-room-kiosk-awake.service
systemctl enable --now common-room-watchdog.timer

echo "Edit $CONFIG_DIR/config.json, then reboot or start the display services."