/**
 * Dynamic Type for the bottom tab labels. Labels scale with the user's text
 * size but stop at an accessibility size, and the tab bar grows by exactly
 * the label's extra line height so nothing clips.
 */

/** Largest text-size multiplier a tab label follows. */
export const TAB_LABEL_MAX_SCALE = 1.4
export const TAB_LABEL_SIZE = 11
/** iOS line height ≈ 1.2× the font size. */
const LINE_HEIGHT_RATIO = 1.2

/** Extra tab-bar height (pt) the scaled label needs over its 1× size. */
export function tabLabelExtraHeight(fontScale: number): number {
  const scale = Math.min(Math.max(fontScale || 1, 1), TAB_LABEL_MAX_SCALE)
  return Math.ceil(TAB_LABEL_SIZE * LINE_HEIGHT_RATIO * (scale - 1))
}
