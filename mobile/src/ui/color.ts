/**
 * Hex color helpers (6-digit `#rrggbb`; anything else is returned unchanged).
 */

/** Darkens a hex color by `amount` (0..1), scaling each RGB channel toward 0. */
export function darkenHex(hex: string, amount = 0.08): string {
  const m = hex.match(/^#?([a-f0-9]{6})$/i)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))))
  const out = (f(r) << 16) | (f(g) << 8) | f(b)
  return '#' + out.toString(16).padStart(6, '0')
}

/**
 * Lightens a hex color by `amount` (0..1), nudging each RGB channel
 * proportionally toward 255. Counterpart to darkenHex — handy for
 * deriving a calmer canvas tone from an avatar's saturated tile.
 */
export function lightenHex(hex: string, amount = 0.08): string {
  const m = hex.match(/^#?([a-f0-9]{6})$/i)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  const f = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c + (255 - c) * amount)))
  const out = (f(r) << 16) | (f(g) << 8) | f(b)
  return '#' + out.toString(16).padStart(6, '0')
}
