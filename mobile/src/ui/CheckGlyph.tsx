import React from 'react'
import { Check } from 'lucide-react-native'
import { useTheme } from '../app/theme'

/**
 * The single done / selected checkmark for the whole app.
 *
 * The codebase previously drew this two different ways — a text `✓` glyph in
 * checkboxes and picker rows, and a lucide `<Check>` in others (even
 * side-by-side: the TaskItem checkbox used `✓` while its own swipe "Mark done"
 * action used `<Check>`). Standardize on lucide here so the most-repeated
 * affordance reads as one shape/weight everywhere.
 *
 * Defaults to the on-primary foreground (white check on a filled checkbox);
 * pass `color` for picker-row checks that tint to the option color.
 */
export default function CheckGlyph({
  size = 14,
  color,
  strokeWidth = 3,
}: {
  size?: number
  color?: string
  strokeWidth?: number
}) {
  const theme = useTheme()
  return <Check size={size} color={color ?? theme.primaryOn} strokeWidth={strokeWidth} />
}
