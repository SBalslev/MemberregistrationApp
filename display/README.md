# Common-room display

The `display` component runs the Raspberry Pi common-room TV, polls the member
tablet's public statistics feed, rotates local photos, accepts temporary photo
uploads, and provides trainer moderation.

## Local development

Requires Python 3.10 or later.

```powershell
python -m pip install -e .\display
Copy-Item .\display\config.example.json .\display\config.json
common-room-display --config .\display\config.json
```

Open these local pages:

- TV display: `http://127.0.0.1:8090/`
- Photo upload: `http://127.0.0.1:8090/upload`
- Trainer moderation: `http://127.0.0.1:8090/admin`

Run tests with:

```powershell
python -m unittest discover -s display\tests -v
```

## Raspberry Pi installation

Use Raspberry Pi OS Lite 32-bit. Connect the Pi to the TV through HDMI, connect it
to the club network, and copy or clone this repository onto the Pi.

```bash
cd /path/to/Medlemscheckin
sudo ./display/deploy/install.sh
```

The installer creates a dedicated `display` user, installs Python, Chromium, and a
minimal X server, installs the service under `/opt/medlemscheckin-display`, and
enables the backend, kiosk, anti-blanking, and recovery services. If Raspberry Pi
OS Desktop is installed, the installer disables LightDM so it cannot compete with
the dedicated kiosk for the TV display.

## Configuration

Edit `/etc/medlemscheckin-display/config.json` as root.

The default configuration discovers the member tablet through its existing mDNS
advertisement:

```json
"tabletFeedUrl": "auto"
```

The upload QR code defaults to the Pi's current hostname with `.local`, so DHCP
address changes do not invalidate it:

```json
"publicBaseUrl": "auto"
```

The installer enables Avahi for `.local` hostname resolution. Explicit HTTP or
HTTPS URLs remain supported for networks that block multicast DNS.

For internet photo uploads, configure the relay after deploying the API migration:

```json
"relayBaseUrl": "https://iss-skydning.dk/api/v1",
"relayDeviceToken": "<same random token as DISPLAY_RELAY_DEVICE_TOKEN>",
"relayDisplayId": "club-display",
"relayPollIntervalSeconds": 15
```

Generate the shared device token with `openssl rand -hex 32`. The Pi creates a new
unguessable upload invitation every 55 minutes. Phones upload to the website, and
the Pi downloads queued photos over outbound HTTPS. Do not expose port `8090` to
the internet.

Generate the trainer PIN hash. The command prompts without echoing the PIN:

```bash
/opt/medlemscheckin-display/.venv/bin/common-room-display --hash-pin
```

Put the resulting value in `trainerPinHash`. Never put the plaintext PIN in the
configuration file.

Start the services after configuration:

```bash
sudo systemctl start common-room-display.service
sudo systemctl start common-room-kiosk.service
```

## Permanent photos

Copy permanent JPEG, PNG, or WebP files to:

```text
/var/lib/medlemscheckin-display/media/permanent
```

The playlist discovers the directory automatically. Trainers can also promote a
temporary upload from the moderation page.

## Operations

Check service state and recent logs:

```bash
systemctl status common-room-display.service common-room-kiosk.service common-room-kiosk-awake.service common-room-watchdog.timer
journalctl -u common-room-display.service -u common-room-kiosk.service -u common-room-kiosk-awake.service -u common-room-watchdog.service -n 100
```

The watchdog requests the full local playlist every minute. It restarts an
unresponsive backend together with its dependent Chromium kiosk and reconnects
`wlan0` when the Wi-Fi gateway is unreachable. The installer also enables
persistent system logs under `/var/log/journal` so failure evidence survives a
reboot.

Restart the display:

```bash
sudo systemctl restart common-room-display.service common-room-kiosk.service common-room-kiosk-awake.service
```

Back up these paths:

- `/etc/medlemscheckin-display/config.json`
- `/var/lib/medlemscheckin-display/display.db`
- `/var/lib/medlemscheckin-display/media/permanent/`

Temporary uploads do not need backup. If the database is lost, permanent files
remain discoverable, while temporary upload history is reset.

## Network notes

The display-feed and upload pages are intentionally reachable on the local network.
The Pi discovers the member tablet's existing sync advertisement but requests only
the separate public display-feed route. It does not pair with the tablet or join the
trusted sync mesh. Do not forward port `8090` through the internet router. Existing
membership sync routes remain protected by their normal device authentication.

When the relay is configured, the TV QR points to the HTTPS relay instead of the
local upload page. Local upload remains available as an offline fallback.
