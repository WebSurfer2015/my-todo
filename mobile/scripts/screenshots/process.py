#!/usr/bin/env python3
"""Process raw simulator/device captures into store-accepted sizes.

Usage:
  python3 scripts/screenshots/process.py mobile/screenshots/iphone-67
  python3 scripts/screenshots/process.py mobile/screenshots/ipad-129
  python3 scripts/screenshots/process.py mobile/screenshots/android-phone

Reads <dir>/raw/*.png, writes <dir>/processed/*.png. Behavior differs by
store:

iOS (App Store Connect) — ASC requires exact slot dimensions, so
captures get downscaled to the matching APP_IPHONE_67 / APP_IPAD_PRO_3GEN_129
slot sizes via LANCZOS. Unknown sizes are skipped with a warning.

Android (Play Console) — Play accepts any portrait screenshot in
320–3840px per side, so native captures pass through unchanged. Bounds
are checked; out-of-range sizes are flagged but still copied so the
operator can decide.

iOS slot map (ASC requires exact dimensions per slot):
  1320x2868  -> 1290x2796  (iPhone 17 Pro Max -> APP_IPHONE_67)
  2064x2752  -> 2048x2732  (iPad Pro 13" M5 -> APP_IPAD_PRO_3GEN_129)
  1290x2796  -> 1290x2796  (passthrough)
  2048x2732  -> 2048x2732  (passthrough)

Android known passthroughs (any modern Pixel works; the list documents
what's been tested):
  1080x2400  Pixel 7/8, common AVD default
  1080x2424  Pixel 9 / Pixel 10
  1280x2856  Pixel 9 Pro
  1344x2992  Pixel 9 Pro XL / Pixel 8 Pro
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image

TARGETS = {
    (1320, 2868): (1290, 2796),
    (2064, 2752): (2048, 2732),
    (1290, 2796): (1290, 2796),
    (2048, 2732): (2048, 2732),
}

# Play Console accepts any portrait between 320 and 3840px per side.
PLAY_MIN = 320
PLAY_MAX = 3840


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: process.py <dir>", file=sys.stderr)
        return 2
    base = Path(sys.argv[1]).expanduser().resolve()
    src = base / "raw"
    dst = base / "processed"
    if not src.is_dir():
        print(f"missing raw dir: {src}", file=sys.stderr)
        return 1
    dst.mkdir(parents=True, exist_ok=True)

    # Android captures pass through; iOS captures get matched against
    # exact slot sizes. Detect from the directory name so the same
    # script handles both pipelines.
    is_android = "android" in base.name.lower()

    pngs = sorted(p for p in src.iterdir() if p.suffix.lower() == ".png")
    if not pngs:
        print(f"no PNGs in {src}", file=sys.stderr)
        return 1

    for p in pngs:
        with Image.open(p) as im:
            size = im.size
            out = dst / p.name
            if is_android:
                w, h = size
                if not (PLAY_MIN <= w <= PLAY_MAX and PLAY_MIN <= h <= PLAY_MAX):
                    print(f"  WARN {p.name}  {w}x{h} outside Play bounds [{PLAY_MIN},{PLAY_MAX}]; copied anyway")
                shutil.copy2(p, out)
                print(f"  pass {p.name}  {w}x{h} (android, native)")
                continue
            target = TARGETS.get(size)
            if target is None:
                print(f"  SKIP {p.name}  unexpected {size[0]}x{size[1]}")
                continue
            if size == target:
                shutil.copy2(p, out)
                print(f"  pass {p.name}  {size[0]}x{size[1]}")
            else:
                resized = im.resize(target, Image.LANCZOS)
                resized.save(out, format="PNG", optimize=True)
                print(f"  down {p.name}  {size[0]}x{size[1]} -> {target[0]}x{target[1]}")
    print(f"\nprocessed -> {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
