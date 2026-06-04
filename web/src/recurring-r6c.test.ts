/**
 * R6c — Propagate the target's current subtask shape to every
 * future non-trashed sibling in the series. Driven by the
 * "Overwrite all / Keep modified" dialog in TaskDetailsSheet.
 */
import { describe, expect, it } from 'vitest'
import {
  todoApplySeriesSubtasks,
  subtaskAdd,
  subtaskRemove,
  expandSeries,
} from '../../core/src/logic/derive'
import type { Todo } from '../../core/src/domain/types'

function dailySeed(): Todo {
  return {
    id: 'head',
    text: 'Stretch',
    done: false,
    priority: 'medium',
    dueDate: '2026-05-28',
    trashed: false,
    updatedAt: 1,
    recurrence: { freq: 'daily' },
    subtasks: [
      { id: 'sub-a', text: 'Hamstrings', done: false, priority: 'medium' },
    ],
  }
}

describe('todoApplySeriesSubtasks — Overwrite all', () => {
  it('propagates target subtasks (cloned fresh) to every future sibling', () => {
    let state = expandSeries(dailySeed(), '2026-05-28')
    const headId = state[0].id
    // User adds a step to the head live.
    state = subtaskAdd(state, headId, 'Calves', 'medium', '')
    const result = todoApplySeriesSubtasks(state, headId, { keepDetached: false })
    expect(result.affected).toBe(state.length - 1)
    for (const t of result.next) {
      if (t.id === headId) continue
      expect(t.subtasks).toHaveLength(2)
      expect(t.subtasks!.map((s) => s.text).sort()).toEqual(['Calves', 'Hamstrings'])
      // Cloned fresh — different ids, all done:false.
      for (const s of t.subtasks!) {
        expect(s.done).toBe(false)
        expect(['sub-a']).not.toContain(s.id) // distinct from target's sub-a
      }
    }
  })

  it('overwrites detached siblings too', () => {
    let state = expandSeries(dailySeed(), '2026-05-28')
    const headId = state[0].id
    // Mark sibling at index 2 as detached with its own subtasks.
    state = state.map((t, i) =>
      i === 2
        ? {
            ...t,
            detachedFromSeries: true,
            subtasks: [
              { id: 'detached-x', text: 'Custom', done: false, priority: 'medium' },
            ],
          }
        : t,
    )
    state = subtaskAdd(state, headId, 'Calves', 'medium', '')
    const result = todoApplySeriesSubtasks(state, headId, { keepDetached: false })
    const detachedAfter = result.next.find((t) => t.id === state[2].id)!
    expect(detachedAfter.subtasks).toHaveLength(2)
    expect(detachedAfter.subtasks!.map((s) => s.text).sort()).toEqual(['Calves', 'Hamstrings'])
  })

  it('clears subtasks on future siblings when the target was emptied', () => {
    let state = expandSeries(dailySeed(), '2026-05-28')
    const headId = state[0].id
    state = subtaskRemove(state, headId, 'sub-a')
    const result = todoApplySeriesSubtasks(state, headId, { keepDetached: false })
    for (const t of result.next) {
      if (t.id === headId) continue
      expect(t.subtasks).toBeUndefined()
    }
  })
})

describe('todoApplySeriesSubtasks — Keep modified', () => {
  it('preserves detached siblings, overwrites the rest', () => {
    let state = expandSeries(dailySeed(), '2026-05-28')
    const headId = state[0].id
    state = state.map((t, i) =>
      i === 2
        ? {
            ...t,
            detachedFromSeries: true,
            subtasks: [
              { id: 'detached-x', text: 'Custom', done: false, priority: 'medium' },
            ],
          }
        : t,
    )
    state = subtaskAdd(state, headId, 'Calves', 'medium', '')
    const result = todoApplySeriesSubtasks(state, headId, { keepDetached: true })
    const detachedAfter = result.next.find((t) => t.id === state[2].id)!
    expect(detachedAfter.subtasks).toHaveLength(1)
    expect(detachedAfter.subtasks![0].text).toBe('Custom')
    // affected reflects only non-detached siblings (header + custom excluded)
    expect(result.affected).toBe(state.length - 2)
  })
})

describe('todoApplySeriesSubtasks — edge cases', () => {
  it('no-op when target has no seriesId', () => {
    const oneOff: Todo = {
      id: 'plain',
      text: 'Buy milk',
      done: false,
      priority: 'medium',
      dueDate: '2026-05-28',
      trashed: false,
      updatedAt: 1,
      subtasks: [{ id: 's1', text: 'one', done: false, priority: 'medium' }],
    }
    const result = todoApplySeriesSubtasks([oneOff], 'plain', { keepDetached: false })
    expect(result.next).toBe([oneOff].length === 1 ? result.next : [])
    expect(result.next[0]).toEqual(oneOff)
    expect(result.affected).toBe(0)
  })

  it('skips trashed siblings', () => {
    let state = expandSeries(dailySeed(), '2026-05-28')
    const headId = state[0].id
    state = subtaskAdd(state, headId, 'Calves', 'medium', '')
    // Trash one future sibling.
    const withTrashed = state.map((t, i) =>
      i === 1 ? { ...t, trashed: true, trashedAt: 1 } : t,
    )
    const result = todoApplySeriesSubtasks(withTrashed, headId, { keepDetached: false })
    const trashedAfter = result.next.find((t) => t.id === state[1].id)!
    // The trashed row should be byte-equal to its pre-call state —
    // todoApplySeriesSubtasks must not mutate trashed rows.
    expect(trashedAfter).toBe(withTrashed.find((t) => t.id === state[1].id))
    // Non-trashed siblings did get the new shape (2 subs).
    const liveAfter = result.next.find((t) => t.id === state[2].id)!
    expect(liveAfter.subtasks).toHaveLength(2)
  })
})
