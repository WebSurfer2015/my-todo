#!/usr/bin/env bash
# Capture a screenshot from the booted iOS simulator into a numbered slot.
#
# Usage:
#   scripts/screenshots/capture.sh <slot> <device> [udid]
#     <slot>    1..10 (v1.4 plan — adds AI + Reminders + Guides slots)
#     <device>  iphone-67 | ipad-129
#     [udid]    optional simulator UDID; defaults to "booted"
#               (pass when more than one sim is booted to disambiguate)
#
# Output goes to mobile/screenshots/<device>/raw/<slot>-<short-name>.png
# at the simulator's native resolution. Run process.py afterwards to
# downscale into ASC-accepted slot sizes.

set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: $0 <slot 1-10> <iphone-67|ipad-129> [udid]" >&2
  exit 2
fi

slot="$1"
device="$2"
target="${3:-booted}"

case "$device" in
  iphone-67|ipad-129) ;;
  *) echo "device must be iphone-67 or ipad-129" >&2; exit 2 ;;
esac

# v1.4 slot plan (adds AI / Reminders / Guides as marketable features):
#   1. Home tab — hero (now includes "N done today" line when applicable)
#   2. Todos tab — All filter, grouped sections, sticky pebble strip
#   3. Edit Todo sheet — Notes inline + Remind me row visible
#   4. Steps inside a todo — per-step dates + "Suggest steps" affordance
#   5. Groceries tab — items grouped by department
#   6. AI inline pills — compose with category / due / recurrence / reminder
#   7. Reminder sub-view — datetime picker + interval chips + Until
#   8. Tips & guides — menu list with check marks on completed guides
#   9. DeferModal — "Defer to" calm rescheduling
#  10. Recurring task — Repeat picker with weekday filter selected
case "$slot" in
  1)  name="home-today-hero" ;;
  2)  name="todos-all-grouped" ;;
  3)  name="edit-todo-reminder" ;;
  4)  name="steps-with-suggest" ;;
  5)  name="groceries-by-store" ;;
  6)  name="ai-pills-compose" ;;
  7)  name="reminder-subview" ;;
  8)  name="tips-and-guides" ;;
  9)  name="defer-to-sheet" ;;
  10) name="recurring-repeats" ;;
  *) echo "slot must be 1..10" >&2; exit 2 ;;
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
