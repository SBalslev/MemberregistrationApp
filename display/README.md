# Common-room display

The `display` component runs the Raspberry Pi common-room TV, polls the member
tablet's public statistics feed, rotates local photos, accepts temporary photo
uploads, provides trainer moderation, and displays scheduled announcements from
the existing trainer/admin web portal.

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
node --test display\tests\kiosk_rotation.test.cjs
node --test display\tests\photo_upload.test.cjs
node --test portal\tests\announcement_editor.test.cjs
php portal\tests\announcement_image.test.php
```

The kiosk rendering and timing tests use Node.js's built-in test runner; Node.js is not required
on the Raspberry Pi. The portal image tests require PHP GD and EXIF.

## Phone photo uploads

Both the internet QR page and the Pi's local `/upload` page offer **Vælg fra
galleri** and **Tag et foto** separately. The gallery input does not request camera
capture; the camera input requests the rear camera where supported. The operating
system controls the native picker, so desktop browsers may show a file picker for
both choices.

The selected photo is previewed before sending and can be replaced or removed.
The page retains the gallery file while decoding and retries failed blob previews
using a data URL. If the browser still cannot show a readable file, **Send uden
forhåndsvisning** lets the visitor submit it for the existing server-side validation.
Files that cannot be read from the gallery remain blocked with an explicit error.
Failed requests retain the photo for retry. The pages support light and dark
themes, touch-sized controls, and screen-reader status messages.

JPEG, PNG, and WebP are supported, with a 20-megapixel limit. HEIC/HEIF must be
exported as JPEG first. The internet relay accepts files up to 10 MiB; the local
service uses its configured `maxUploadBytes` limit. Existing server-side
validation, metadata removal, and temporary-photo expiry remain unchanged.

The two pages are deployed independently: deploy
`api/handlers/display_relay.php` to update the internet QR page, and
`display/src/common_room_display/static/upload.html` to update the Pi fallback.
Updating only the Pi does not change the internet upload page.

## Score format

Results with recorded krydser show `points/krydser`, for example `198/7` or
`190/0`, in the top results, daily results, and personal-best highlights.
Scores without recorded krydser stay points-only; missing values are not treated
as zero. This also supports cached feeds from older tablet versions.

Top and daily results already carry krydser in the tablet feed. Personal-best
krydser requires the updated member-tablet app as well as the updated Pi page.

## Display timing

The photo and scores overview stays visible for 60 seconds before each full-screen
announcement. After the announcement's configured duration, the overview returns
for another 60 seconds. Photos, score pages, highlights, and club-pulse headlines
continue rotating every 12 seconds within the overview.

## Announcement images

**Vis hele billedet** is the default: the TV and portal preview preserve the
image's proportions and show it without cropping. Empty space around a portrait
or panorama is intentional.

For a tall poster or wide panorama, select **Panorér langsomt over billedet** in
Skærmbeskeder. The image fills its panel and moves from top to bottom or left to
right along the overflowing dimension. One pass uses the message's display time,
with the first and last 10 percent reserved for pauses. Use 30-60 seconds for
long images. The preview also pans and restarts when the image, mode, or duration
changes. Reduced-motion preferences restore the static whole-image view.

Camera JPEG orientation, including mirrored orientations, is applied before
resizing and stripping metadata. Images uploaded before this fix may need to be
uploaded again: discarded orientation metadata cannot be recovered.

Deployment requires the
[1.14.0 migration](../api/schema/V1_14_0__add_announcement_image_display_mode.sql)
before updating the portal and display-content handler. The portal host needs GD
and EXIF; missing EXIF support produces an explicit upload error. Update the Pi's
announcement service and kiosk page as well. Older cached feeds without
`imageDisplayMode` continue using the static whole-image view.

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

The same relay credential delivers scheduled announcements. Apply
`api/schema/V1_13_0__add_display_announcements.sql`, deploy the display-content
API routes, and set the announcement poll interval if the default of 60 seconds
is not suitable:

```json
"announcementPollIntervalSeconds": 60
```

Trainers and administrators manage announcements from the existing member portal
at `/portal/announcements.php`. The portal host needs PHP GD with JPEG, PNG, and
WebP support for safe image re-encoding.

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

Announcement metadata remains in MySQL. The Pi caches active and near-future
announcements under `data/cache/` and processed announcement images under
`data/media/announcements/`. These files can be recreated from the cloud.

## Network notes

The display-feed and upload pages are intentionally reachable on the local network.
The Pi discovers the member tablet's existing sync advertisement but requests only
the separate public display-feed route. It does not pair with the tablet or join the
trusted sync mesh. Do not forward port `8090` through the internet router. Existing
membership sync routes remain protected by their normal device authentication.

When the relay is configured, the TV QR points to the HTTPS relay instead of the
local upload page. Local upload remains available as an offline fallback.
