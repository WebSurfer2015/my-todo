import { PRIORITY_COLORS } from '../types'
import type { Priority } from '../types'

export default function PriorityDot({ level }: { level: Priority }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: PRIORITY_COLORS[level],
      flexShrink: 0,
    }} />
  )
}
