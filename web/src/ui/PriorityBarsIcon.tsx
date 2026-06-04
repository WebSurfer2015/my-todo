import { PRIORITY_COLORS } from '../core-bindings/types'
import type { Priority } from '../core-bindings/types'

const LIT_COUNT: Record<Priority, number> = { low: 1, medium: 2, high: 3 }

export default function PriorityBarsIcon({ level }: { level: Priority }) {
  const lit = LIT_COUNT[level]
  const active = PRIORITY_COLORS[level]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: 1.5,
        height: 12,
      }}
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => {
        const heights = [4, 8, 12]
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              width: 2.5,
              height: heights[i],
              borderRadius: 1,
              background: i < lit ? active : 'var(--gray3)',
            }}
          />
        )
      })}
    </span>
  )
}
