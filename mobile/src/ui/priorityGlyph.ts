import type { Priority } from '../core-bindings/types'
import type { ThemeColors } from '../app/theme'

/**
 * Ink for the filled bars of the priority glyph (PriorityBars, which
 * PriorityDot also renders). The bar COUNT carries the level; color only
 * adds a warm lift to High. High is the warm-text amber/terracotta —
 * never red (red is reserved for permanent deletes). Medium and Low stay
 * neutral so a list doesn't read as a wall of urgency.
 *
 * Every value clears WCAG non-text contrast (3:1) on cards and the page
 * background in all themes — guarded by themeContrast.test.ts.
 */
export function priorityGlyphColor(c: ThemeColors, level: Priority): string {
  return level === 'high' ? c.warmText : c.label2
}
