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
enables both `systemd` units.

## Configuration

Edit `/etc/medlemscheckin-display/config.json` as root.

Set `tabletFeedUrl` to the membership tablet's local address:

```json
"tabletFeedUrl": "http://192.168.1.50:8085/api/display/v1/feed"
```

Set `publicBaseUrl` to the address phones use when scanning the QR code. Prefer a
DHCP reservation and local DNS name:

```json
"publicBaseUrl": "http://club-display.local:8090"
```

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
systemctl status common-room-display.service common-room-kiosk.service
journalctl -u common-room-display.service -u common-room-kiosk.service -n 100
```

Restart the display:

```bash
sudo systemctl restart common-room-display.service common-room-kiosk.service
```

Back up these paths:

- `/etc/medlemscheckin-display/config.json`
- `/var/lib/medlemscheckin-display/display.db`
- `/var/lib/medlemscheckin-display/media/permanent/`

Temporary uploads do not need backup. If the database is lost, permanent files
remain discoverable, while temporary upload history is reset.

## Network notes

The display-feed and upload pages are intentionally reachable on the local network.
Do not forward port `8090` through the internet router. Existing membership sync
routes remain protected by their normal device authentication.
