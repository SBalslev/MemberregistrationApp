#!/bin/sh
set -eu

exec /usr/bin/xinit \
    /usr/local/bin/medlemscheckin-chromium \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-translate \
    --disable-gpu \
    http://127.0.0.1:8090/ \
    -- :0 vt7 -nolisten tcp -nocursor