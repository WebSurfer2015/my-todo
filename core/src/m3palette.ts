/**
 * Tiny M3-flavored tonal palette derived from a single seed hex color.
 *
 * Material 3 expresses surface colors as tones (0-100 lightness) on a hue/chroma
 * derived from a seed. The full HCT/CAM16 algorithm is large; this is a
 * lightweight HSL approximation that's "good enough" for tinting one
 * dialog/modal at a time. Output is deterministic and platform-agnostic
 * (plain hex strings).
 */

export interface TonalPalette {
  /** Primary action color (~tone 40 light / tone 80 dark). */
  primary: string;
  /** Text/icon color on top of `primary`. */
  onPrimary: string;
  /** Soft container tint for hero surfaces (~tone 90 / tone 30). */
  primaryContainer: string;
  /** Text/icon color on top of `primaryContainer`. */
  onPrimaryContainer: string;
  /** Page-level surface tinted with the seed (very subtle). */
  surface: string;
  /** Slightly raised surface (modal background). */
  surfaceContainer: string;
  /** Higher-emphasis surface (subtask card background). */
  surfaceContainerHigh: string;
  /** Outline color for chips/borders. */
  outline: string;
  /** Default text/icon color over surface. */
  onSurface: string;
  /** De-emphasized text/icon color over surface. */
  onSurfaceVariant: string;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string): HSL {
  const clean = hex.replace("#", "").trim();
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360 / 360;
  const sat = Math.max(0, Math.min(1, s));
  const light = Math.max(0, Math.min(1, l));
  let r: number, g: number, b: number;
  if (sat === 0) {
    r = g = b = light;
  } else {
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    const hueToRgb = (t: number) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    r = hueToRgb(hue + 1 / 3);
    g = hueToRgb(hue);
    b = hueToRgb(hue - 1 / 3);
  }
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Derive a tonal palette from a single seed hex color.
 * @param hex seed (e.g. '#FF3B30')
 * @param dark generate dark-mode variants
 */
export function tonalPalette(hex: string, dark = false): TonalPalette {
  const { h, s } = hexToHsl(hex);
  // Damp the saturation on neutral surfaces so containers don't feel garish.
  const surfaceSat = Math.min(0.18, s * 0.3);
  const containerSat = Math.min(0.55, s * 0.75);
  const primarySat = Math.max(0.45, s);

  if (dark) {
    return {
      primary: hslToHex(h, primarySat, 0.78),
      onPrimary: hslToHex(h, primarySat * 0.4, 0.18),
      primaryContainer: hslToHex(h, containerSat, 0.28),
      onPrimaryContainer: hslToHex(h, containerSat * 0.6, 0.92),
      surface: hslToHex(h, surfaceSat, 0.09),
      surfaceContainer: hslToHex(h, surfaceSat, 0.14),
      surfaceContainerHigh: hslToHex(h, surfaceSat, 0.19),
      outline: hslToHex(h, surfaceSat, 0.42),
      onSurface: hslToHex(h, surfaceSat * 0.3, 0.93),
      onSurfaceVariant: hslToHex(h, surfaceSat * 0.3, 0.74),
    };
  }
  return {
    primary: hex,
    onPrimary: "#FFFFFF",
    primaryContainer: hslToHex(h, containerSat, 0.92),
    onPrimaryContainer: hslToHex(h, containerSat, 0.16),
    surface: hslToHex(h, surfaceSat, 0.985),
    surfaceContainer: hslToHex(h, surfaceSat, 0.965),
    surfaceContainerHigh: hslToHex(h, surfaceSat, 0.94),
    outline: hslToHex(h, surfaceSat, 0.68),
    onSurface: hslToHex(h, surfaceSat * 0.4, 0.13),
    onSurfaceVariant: hslToHex(h, surfaceSat * 0.4, 0.38),
  };
}
