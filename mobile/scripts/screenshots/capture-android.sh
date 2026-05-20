#!/usr/bin/env bash
# Capture a screenshot from a connected Android device or running emulator.
#
# Usage:
#   scripts/screenshots/capture-android.sh <slot> [adb-serial]
#     <slot>    1..8 (mirrors the iOS slot plan in capture.sh)
#     [serial]  optional adb device serial; defaults to the only device
#               currently attached (fails if multiple are connected)
#
# Output goes to mobile/screenshots/android-phone/raw/<slot>-<short-name>.png
# at the device's native resolution. Run process.py afterwards to copy
# valid sizes through to mobile/screenshots/android-phone/processed/.
#
# Prerequisites:
#   - `adb` in PATH (Android platform-tools — `brew install --cask
#     android-platform-tools` on macOS, or via Android Studio's SDK Manager).
#   - At least one device/emulator attached: `adb devices`
#   - Sagely dev client installed and running with seeded sample data,
#     signed into the demo account (sagely.todo@gmail.com).
#
# Pre-capture device prep (do once per session for a coherent set):
#   - System clock to a fixed marketing time (9:41 is the convention)
#   - Battery 100%, Wi-Fi connected, airplane mode off, notifications cleared
#   - Gesture navigation enabled (no on-screen back/home pill)
#   - Demo data populated with humane content ("Refill prescription,"
#     "Email therapist," "Tidy the desk for 5 min" / for Groceries:
#     "Sourdough loaf," "Cilantro," "Frozen peas")
#
# Play Console accepts screenshots between 320–3840px per side. Modern
# Pixel resolutions (1080×2400 / 1080×2424 / 1280×2856 / 1344×2992) all
# pass through process.py unmodified — no downscale needed the way ASC
# requires for iPhone/iPad slots.

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 <slot 1-8> [adb-serial]" >&2
  exit 2
fi

slot="$1"
serial="${2:-}"

# v1.3 slot plan — keep in lockstep with capture.sh and the screenshot
# specs table in docs/POSITIONING.md.
case "$slot" in
  1) name="home-today-hero" ;;
  2) name="todos-all-grouped" ;;
  3) name="defer-to-sheet" ;;
  4) name="edit-todo-notes-inline" ;;
  5) name="steps-with-dates" ;;
  6) name="groceries-by-store" ;;
  7) name="profile-sheet" ;;
  8) name="recurring-repeats" ;;
  *) echo "slot must be 1..8" >&2; exit 2 ;;
esac

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found in PATH; install Android platform-tools first" >&2
  exit 3
fi

if [[ -n "$serial" ]]; then
  adb_cmd=(adb -s "$serial")
else
  # Sanity check: require exactly one device when no serial is provided so
  # we don't silently capture against the wrong target.
  count=$(adb devices | awk 'NR>1 && $2=="device" {n++} END {print n+0}')
  if [[ "$count" -eq 0 ]]; then
    echo "no Android devices attached; check 'adb devices'" >&2
    exit 4
  elif [[ "$count" -gt 1 ]]; then
    echo "multiple devices attached; pass an adb serial as second arg:" >&2
    adb devices >&2
    exit 4
  fi
  adb_cmd=(adb)
fi

# Script lives under mobile/scripts/screenshots/; mobile/ is two levels up.
# Output lands under mobile/screenshots/android-phone/raw — already covered
# by the /screenshots/ entry in mobile/.gitignore.
mobile_root="$(cd "$(dirname "$0")/../.." && pwd)"
out_dir="$mobile_root/screenshots/android-phone/raw"
mkdir -p "$out_dir"

out="$out_dir/${slot}-${name}.png"

# Use a unique remote path per invocation so concurrent runs don't stomp
# each other, then clean up after pulling.
remote="/sdcard/sagely_capture_$$.png"
"${adb_cmd[@]}" shell screencap -p "$remote"
"${adb_cmd[@]}" pull "$remote" "$out" >/dev/null
"${adb_cmd[@]}" shell rm -f "$remote"

size=$(python3 -c "from PIL import Image; im=Image.open('$out'); print(f'{im.size[0]}x{im.size[1]}')")
echo "captured slot $slot ($name) on android ${serial:-default}: $out  [$size]"
