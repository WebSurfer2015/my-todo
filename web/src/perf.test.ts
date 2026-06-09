/**
 * Coarse performance guard for the hot derive path. deriveState +
 * buildGroups run on every store mutation/render; an accidental O(n²)
 * (e.g. a nested find/filter) wouldn't fail any correctness test but
 * would jank large lists. The budget is deliberately generous — real
 * time on a big list is tens of ms — so it only trips on a catastrophic
 * complexity regression, not on CI noise.
 */
import { describe, it, expect } from 'vitest'
import { newTodo, deriveState } from '../../core/src/logic/derive'
import { buildGroups } from '../../core/src/logic/groups'
import { SEED_CATEGORIES } from '../../core/src/data/categories'
import { strings } from '../../core/src/data/i18n'

const t = strings.en
const cats = SEED_CATEGORIES
const priorities = ['high', 'medium', 'low'] as const

function makeTodos(n: number) {
  const out = []
  for (let i = 0; i < n; i++) {
    const due = new Date(2026, 0, 1 + (i % 400)).toISOString().slice(0, 10)
    out.push({
      ...newTodo({
        text: `Task ${i}`,
        priority: priorities[i % 3],
        dueDate: i % 5 === 0 ? '' : due,
        category: cats[i % cats.length].id,
      }),
      done: i % 4 === 0,
    })
  }
  return out
}

describe('derive-path performance', () => {
  const N = 5000
  const todos = makeTodos(N)

  it(`deriveState on ${N} todos stays well under budget`, () => {
    const start = performance.now()
    const state = deriveState({ todos, filters: [], categories: cats, t })
    const ms = performance.now() - start
    expect(state.groups.length).toBeGreaterThan(0)
    expect(ms, `deriveState took ${ms.toFixed(1)}ms for ${N} todos`).toBeLessThan(1000)
  })

  it(`buildGroups on ${N} todos stays well under budget`, () => {
    const start = performance.now()
    const groups = buildGroups(todos, { separateDone: true })
    const ms = performance.now() - start
    expect(groups.length).toBeGreaterThan(0)
    expect(ms, `buildGroups took ${ms.toFixed(1)}ms for ${N} todos`).toBeLessThan(1000)
  })

  // Ratio-of-two-timings is inherently noisy and gets worse under v8
  // coverage instrumentation (the small run is dominated by fixed
  // overhead), so skip it during coverage runs (COVERAGE=1). The two
  // absolute-budget checks above still run and catch real O(n^2) blowups.
  it.skipIf(process.env.COVERAGE === '1')('scales roughly linearly (10× todos ≪ 100× time)', () => {
    const small = makeTodos(1000)
    const big = makeTodos(10000)
    const tA = performance.now()
    deriveState({ todos: small, filters: ['open'], categories: cats, t })
    const dSmall = performance.now() - tA
    const tB = performance.now()
    deriveState({ todos: big, filters: ['open'], categories: cats, t })
    const dBig = performance.now() - tB
    // 10× the input. O(n log n) → ~10-14×. Allow 40× slack for CI noise /
    // fixed overhead; an O(n²) path would be ~100× and trip this.
    const ratio = dBig / Math.max(dSmall, 0.05)
    expect(ratio, `ratio ${ratio.toFixed(1)} (small ${dSmall.toFixed(2)}ms, big ${dBig.toFixed(2)}ms)`).toBeLessThan(40)
  })
})
