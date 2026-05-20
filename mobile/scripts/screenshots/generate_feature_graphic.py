#!/usr/bin/env python3
"""Generate a 1024×500 Play Store feature graphic from existing brand assets.

Composes:
  - Background: Sea-glass `deep` accent from POSITIONING.md palette
  - Mochi mascot (right-aligned) from mobile/assets/mochi-mascot.png
  - "Sagely" wordmark + tagline (left-aligned)

This is the placeholder for the first Internal-testing upload. Replace
with a proper design before shipping to Production.

Run:
  python3 mobile/scripts/screenshots/generate_feature_graphic.py
Outputs to:
  mobile/screenshots/feature-graphic.png
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ── Layout constants ───────────────────────────────────────────────────────
W, H = 1024, 500
# Sea-glass pair "light" — calm cream-grey that lets the mascot pop.
BG_COLOR = (227, 236, 236)
# Deep teal from the brand primary — Sagely-green for typography.
INK_COLOR = (79, 138, 117)
SUBTEXT_COLOR = (110, 120, 110)


def main() -> None:
    mobile_dir = Path(__file__).resolve().parents[2]
    mascot_path = mobile_dir / "assets" / "mochi-mascot.png"
    out_path = mobile_dir / "screenshots" / "feature-graphic.png"

    canvas = Image.new("RGB", (W, H), BG_COLOR)

    # ── Mochi on the right
    mascot = Image.open(mascot_path).convert("RGBA")
    # Scale to ~80% of canvas height, preserving aspect ratio.
    target_h = int(H * 0.82)
    aspect = mascot.size[0] / mascot.size[1]
    target_w = int(target_h * aspect)
    mascot = mascot.resize((target_w, target_h), Image.LANCZOS)
    # Right-aligned with breathing room.
    mascot_x = W - target_w - 40
    mascot_y = (H - target_h) // 2
    canvas.paste(mascot, (mascot_x, mascot_y), mascot)

    # ── Text on the left
    draw = ImageDraw.Draw(canvas)

    # Find a usable sans font available on macOS by default.
    font_candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    title_font = subtitle_font = None
    for path in font_candidates:
        if Path(path).exists():
            try:
                title_font = ImageFont.truetype(path, 96)
                subtitle_font = ImageFont.truetype(path, 38)
                break
            except OSError:
                continue
    if title_font is None:
        # Fallback that PIL ships with — small but at least it draws.
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()

    title = "Sagely"
    subtitle = "Calmer to-dos for hard days"
    title_x = 64
    title_y = 150
    draw.text((title_x, title_y), title, font=title_font, fill=INK_COLOR)
    draw.text(
        (title_x, title_y + 130),
        subtitle,
        font=subtitle_font,
        fill=SUBTEXT_COLOR,
    )

    canvas.save(out_path, format="PNG", optimize=True)
    print(f"wrote {out_path}  [{W}x{H}]")


if __name__ == "__main__":
    main()
