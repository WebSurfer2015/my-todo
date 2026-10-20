import React from 'react'
import type { Priority } from '../core-bindings/types'
import PriorityBars from './PriorityBars'

/**
 * Legacy name kept for its many call sites: renders the same three-bar
 * glyph the Filter sheet uses (PriorityBars), so priority has one look
 * everywhere. `size` was a dot diameter; bars need a touch more room to
 * stay legible, so the badge is scaled up slightly.
 */
export default function PriorityDot({ level, size = 10 }: { level: Priority; size?: number }) {
  return <PriorityBars level={level} size={Math.round(size * 1.3)} />
}
