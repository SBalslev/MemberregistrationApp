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
    --window-position=0,0 \
    --window-size=3840,2160 \
    http://127.0.0.1:8090/ \
    -- :0 vt7 -nolisten tcp -nocursor