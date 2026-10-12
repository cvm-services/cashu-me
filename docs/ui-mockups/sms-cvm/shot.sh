#!/usr/bin/env bash
# Render every mockup screen to PNG at 2x (780x1688). Guards against silent blank renders.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p png

CHROME=""
for c in google-chrome google-chrome-stable chromium chromium-browser; do
  command -v "$c" >/dev/null 2>&1 && CHROME=$(command -v "$c") && break
done
if [ -z "$CHROME" ]; then
  for c in "$HOME"/.cache/ms-playwright/*/chrome-linux/chrome "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome; do
    [ -x "$c" ] && CHROME="$c" && break
  done
fi
[ -z "$CHROME" ] && { echo "FATAL: no chrome/chromium found"; exit 1; }
echo "chrome: $CHROME"

DISTINCT="Pay per message"   # DOM guard string — present in every variant
for v in a b c; do
  for s in 1 2 3 4; do
    out="png/variant-${v}-s${s}.png"
    "$CHROME" --headless=old --disable-gpu --hide-scrollbars \
      --window-size=390,844 --force-device-scale-factor=2 \
      --screenshot="$PWD/$out" "file://$PWD/variant-${v}.html?s=$s" >/dev/null 2>&1
    echo "$out  $(stat -c%s "$out") bytes"
  done
  "$CHROME" --headless=old --disable-gpu --dump-dom "file://$PWD/variant-${v}.html?s=1" 2>/dev/null \
    | grep -q "$DISTINCT" && echo "variant-$v DOM ok" || { echo "variant-$v DOM MISSING COPY — blank render!"; exit 2; }
done

echo "--- blank-render size guard (identical sizes across DIFFERENT screens are a red flag) ---"
md5sum png/variant-*-s*.png | awk '{print $1}' | sort | uniq -c | awk '$1>2{print "WARN: hash appears "$1" times"}'
echo "done"