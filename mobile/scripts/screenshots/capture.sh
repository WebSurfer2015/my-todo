#!/usr/bin/env bash
# Capture a screenshot from the booted iOS simulator into a numbered slot.
#
# Usage:
#   scripts/screenshots/capture.sh <slot> <device>
#     <slot>    1..8 (matches the 8-screen plan in docs/POSITIONING.md)
#     <device>  iphone-67 | ipad-129
#
# Output goes to mobile/screenshots/<device>/raw/<slot>-<short-name>.png
# at the simulator's native resolution. Run process.py afterwards to
# downscale into ASC-accepted slot sizes.

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <slot 1-8> <iphone-67|ipad-129>" >&2
  exit 2
fi

slot="$1"
device="$2"

case "$device" in
  iphone-67|ipad-129) ;;
  *) echo "device must be iphone-67 or ipad-129" >&2; exit 2 ;;
esac

case "$slot" in
  1) name="all-view-populated" ;;
  2) name="task-details-notes" ;;
  3) name="snooze-action-sheet" ;;
  4) name="carried-over-defer-all" ;;
  5) name="done-30day-bin" ;;
  6) name="subtasks-progress" ;;
  7) name="onboarding-mochi" ;;
  8) name="profile-sheet" ;;
  *) echo "slot must be 1..8" >&2; exit 2 ;;
esac

# Script lives under mobile/scripts/screenshots/, so the mobile dir is two
# levels up. Output lands under mobile/screenshots/<device>/raw — gitignored
# in mobile/.gitignore.
mobile_root="$(cd "$(dirname "$0")/../.." && pwd)"
out_dir="$mobile_root/screenshots/$device/raw"
mkdir -p "$out_dir"

out="$out_dir/${slot}-${name}.png"
xcrun simctl io booted screenshot "$out" >/dev/null
size=$(python3 -c "from PIL import Image; im=Image.open('$out'); print(f'{im.size[0]}x{im.size[1]}')")
echo "captured slot $slot ($name) on $device: $out  [$size]"
