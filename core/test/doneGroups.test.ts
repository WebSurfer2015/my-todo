import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildDoneGroups } from '../src/logic/groups'
import type { Todo } from '../src/domain/types'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0)) // 2026-10-19 local
})
afterEach(() => {
  vi.useRealTimers()
})

const binned = (id: string, completionDate: string | undefined, trashedAt: number, extra: Partial<Todo> = {}): Todo => ({
  id,
  text: id,
  done: true,
  priority: 'medium',
  dueDate: '',
  trashed: true,
  trashedAt,
  ...(completionDate ? { completionDate } : {}),
  ...extra,
})

describe('buildDoneGroups', () => {
  it('returns no groups for an empty bin', () => {
    expect(buildDoneGroups([])).toEqual([])
  })

  it('buckets by completionDate: today, yesterday, older dates desc, then earlier', () => {
    const groups = buildDoneGroups([
      binned('old', '2026-10-10', 1),
      binned('legacy', undefined, 2),
      binned('today', '2026-10-19', 3),
      binned('yday', '2026-10-18', 4),
      binned('mid', '2026-10-15', 5),
    ])
    expect(groups.map((g) => g.key)).toEqual(['2026-10-19', '2026-10-18', '2026-10-15', '2026-10-10', 'earlier'])
    expect(groups[0].isToday).toBe(true)
    expect(groups[0].isYesterday).toBe(false)
    expect(groups[1].isYesterday).toBe(true)
    expect(groups[1].isToday).toBe(false)
    expect(groups[2].isToday).toBe(false)
    expect(groups[4].isEarlier).toBe(true)
    expect(groups[4].todos.map((t) => t.id)).toEqual(['legacy'])
  })

  it('files a completion dated after today under Today (no future-day group)', () => {
    const groups = buildDoneGroups([
      binned('skewed', '2026-10-20', 2),
      binned('today', '2026-10-19', 1),
    ])
    expect(groups.map((g) => g.key)).toEqual(['2026-10-19'])
    expect(groups[0].isToday).toBe(true)
    expect(groups[0].todos.map((t) => t.id)).toEqual(['skewed', 'today'])
  })

  it('orders each bucket newest-binned first (missing trashedAt last)', () => {
    const groups = buildDoneGroups([
      binned('first', '2026-10-19', 100),
      binned('noStamp', '2026-10-19', 0, { trashedAt: undefined }),
      binned('latest', '2026-10-19', 300),
      binned('middle', '2026-10-19', 200),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].todos.map((t) => t.id)).toEqual(['latest', 'middle', 'first', 'noStamp'])
  })

  it('groups whatever rows it is given — a skipped ("Not Do") row buckets by its date too', () => {
    // The Done bin holds completed AND skipped rows; filtering out rows that
    // aren't in the bin is the caller's job, not this function's.
    const groups = buildDoneGroups([
      binned('skipped', '2026-10-19', 1, { done: false, status: 'notDo' }),
      binned('done', '2026-10-19', 2),
    ])
    expect(groups[0].todos.map((t) => t.id)).toEqual(['done', 'skipped'])
  })

  it('does not mutate the input order', () => {
    const input = [binned('a', '2026-10-19', 1), binned('b', '2026-10-19', 2)]
    buildDoneGroups(input)
    expect(input.map((t) => t.id)).toEqual(['a', 'b'])
  })
})
