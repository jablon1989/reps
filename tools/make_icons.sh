#!/bin/sh
# Draws the app icons (PNG) from app/frontend/public/favicon.svg, Aura with a
# dumbbell. macOS only: Quick Look (qlmanage) renders the SVG.
#
#   sh tools/make_icons.sh
set -eu
cd "$(dirname "$0")/.."
SRC=app/frontend/public/favicon.svg
OUT=app/frontend/public/icons
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Full-bleed version (no rounded corners, art shrunk into the middle) for
# Android's maskable icon and the iPhone home screen, which crop it themselves.
sed -e 's|<rect width="512" height="512" rx="112" fill="#16191c"/>|<rect width="512" height="512" fill="#16191c"/><g transform="translate(51.2 51.2) scale(0.8)">|' \
    -e 's|</svg>|</g></svg>|' "$SRC" > "$TMP/full.svg"

render() { # svg size name
  qlmanage -t -s "$2" -o "$TMP" "$1" > /dev/null 2>&1
  mv "$TMP/$(basename "$1").png" "$OUT/$3"
}
render "$SRC" 192 icon-192.png
render "$SRC" 512 icon-512.png
render "$TMP/full.svg" 512 maskable-512.png
render "$TMP/full.svg" 180 apple-touch-icon.png
sips -g pixelWidth "$OUT"/*.png | grep -v "^$"
