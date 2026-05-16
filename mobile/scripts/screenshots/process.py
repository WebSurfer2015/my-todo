#!/usr/bin/env python3
"""Downscale raw simulator captures into ASC-accepted slot sizes.

Usage:
  python3 scripts/screenshots/process.py mobile/screenshots/iphone-67
  python3 scripts/screenshots/process.py mobile/screenshots/ipad-129

Reads <dir>/raw/*.png, writes <dir>/processed/*.png at the matching ASC
slot size (LANCZOS). Native captures already at the target size are
copied through. Captures at unexpected sizes are skipped with a warning.

Slot map (ASC requires exact dimensions per slot):
  1320x2868  -> 1290x2796  (iPhone 17 Pro Max -> APP_IPHONE_67)
  1320x2868  -> 1290x2796  (same; rotated portrait)
  2064x2752  -> 2048x2732  (iPad Pro 13" M5 -> APP_IPAD_PRO_3GEN_129)
  1290x2796  -> 1290x2796  (passthrough)
  2048x2732  -> 2048x2732  (passthrough)
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

    pngs = sorted(p for p in src.iterdir() if p.suffix.lower() == ".png")
    if not pngs:
        print(f"no PNGs in {src}", file=sys.stderr)
        return 1

    for p in pngs:
        with Image.open(p) as im:
            size = im.size
            target = TARGETS.get(size)
            out = dst / p.name
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
