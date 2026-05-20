#!/usr/bin/env bash
# Capture a screenshot from the booted iOS simulator into a numbered slot.
#
# Usage:
#   scripts/screenshots/capture.sh <slot> <device> [udid]
#     <slot>    1..8 (v1.3 plan — Home-first navigation)
#     <device>  iphone-67 | ipad-129
#     [udid]    optional simulator UDID; defaults to "booted"
#               (pass when more than one sim is booted to disambiguate)
#
# Output goes to mobile/screenshots/<device>/raw/<slot>-<short-name>.png
# at the simulator's native resolution. Run process.py afterwards to
# downscale into ASC-accepted slot sizes.

set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: $0 <slot 1-8> <iphone-67|ipad-129> [udid]" >&2
  exit 2
fi

slot="$1"
device="$2"
target="${3:-booted}"

case "$device" in
  iphone-67|ipad-129) ;;
  *) echo "device must be iphone-67 or ipad-129" >&2; exit 2 ;;
esac

# v1.3 slot plan (Home-first navigation):
#   1. Home tab — hero / first impression
#   2. Todos tab — All filter, grouped sections
#   3. DeferModal — "Defer to" calm rescheduling
#   4. Edit Todo sheet with Notes inline under the title
#   5. Steps inside a todo (per-step dates)
#   6. Groceries tab — items grouped by department
#   7. Profile sheet — avatar, quote, density
#   8. Recurring task — repeat chips on items / Repeat picker open
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

# Script lives under mobile/scripts/screenshots/, so the mobile dir is two
# levels up. Output lands under mobile/screenshots/<device>/raw — gitignored
# in mobile/.gitignore.
mobile_root="$(cd "$(dirname "$0")/../.." && pwd)"
out_dir="$mobile_root/screenshots/$device/raw"
mkdir -p "$out_dir"

out="$out_dir/${slot}-${name}.png"
xcrun simctl io "$target" screenshot "$out" >/dev/null
size=$(python3 -c "from PIL import Image; im=Image.open('$out'); print(f'{im.size[0]}x{im.size[1]}')")
echo "captured slot $slot ($name) on $device ($target): $out  [$size]"
