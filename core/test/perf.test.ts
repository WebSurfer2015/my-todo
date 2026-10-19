/**
 * Coarse performance guard for the hot derive path. deriveState +
 * buildGroups run on every store mutation/render; an accidental O(n²)
 * (e.g. a nested find/filter) wouldn't fail any correctness test but
 * would jank large lists. The budget is deliberately generous — real
 * time on a big list is tens of ms — so it only trips on a catastrophic
 * complexity regression, not on CI noise.
 */
import { describe, it, expect } from 'vitest'
import { newTodo, deriveState } from '../src/logic/derive'
import { buildGroups } from '../src/logic/groups'
import { SEED_CATEGORIES } from '../src/data/categories'
import { strings } from '../src/data/i18n'

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
    const groups = buildGroups(todos)
    const ms = performance.now() - start
    expect(groups.length).toBeGreaterThan(0)
    expect(ms, `buildGroups took ${ms.toFixed(1)}ms for ${N} todos`).toBeLessThan(1000)
  })

  // Ratio-of-two-timings is inherently noisy and gets worse under v8
  // coverage instrumentation (the small run is dominated by fixed
  // overhead), so skip it during coverage runs (COVERAGE=1). The two
  // absolute-budget checks above still run and catch real O(n^2) blowups.
  it.skipIf(process.env.COVERAGE === '1')('scales roughly linearly (10× todos ≪ 100× time)', () => {
    const small = makeTodos(2000)
    const big = makeTodos(20000)
    const run = (todos: typeof small) => {
      const t0 = performance.now()
      deriveState({ todos, filters: ['open'], categories: cats, t })
      return performance.now() - t0
    }
    // Warm up (JIT, caches) once, then take the FASTEST of 5 runs per size:
    // noise (GC pauses on the big list, a busy CI core while other test files
    // run in parallel) only ever adds time, so the minimum is the stable
    // estimate of the real cost. (A median of 3 still flaked under load.)
    run(small)
    run(big)
    const fastest = (todos: typeof small) => Math.min(...[0, 1, 2, 3, 4].map(() => run(todos)))
    const dSmall = fastest(small)
    const dBig = fastest(big)
    // 10× the input. O(n log n) → ~10-14×. Allow 40× slack for CI noise /
    // fixed overhead; an O(n²) path would be ~100× and trip this.
    const ratio = dBig / Math.max(dSmall, 0.05)
    expect(ratio, `ratio ${ratio.toFixed(1)} (small ${dSmall.toFixed(2)}ms, big ${dBig.toFixed(2)}ms)`).toBeLessThan(40)
  })
})
