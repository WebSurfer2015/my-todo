/**
 * Details "Edit this only": a field edit detaches a series row — except from a
 * series created in this same details session (it goes to the whole series).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detachOnEditDecision } from '../features/task/TaskDetailsSheet/detachPolicy'

const base = {
  isSeriesRow: true,
  alreadyDetached: false,
  editMode: 'this' as const,
  entrySeriesId: 's',
  recurrenceSteps: 0,
}

describe('detachOnEditDecision', () => {
  it('an existing series row in "this only" mode detaches (once)', () => {
    expect(detachOnEditDecision(base)).toBe('detach')
    expect(detachOnEditDecision({ ...base, alreadyDetached: true })).toBe('none')
  })

  it('a one-off made to repeat in this session propagates instead of detaching its own head', () => {
    expect(detachOnEditDecision({ ...base, entrySeriesId: undefined, recurrenceSteps: 1 })).toBe('propagate')
    // Even if a later step flagged it detached.
    expect(detachOnEditDecision({ ...base, entrySeriesId: undefined, recurrenceSteps: 2, alreadyDetached: true })).toBe('propagate')
  })

  it('an existing series whose rule changed this session still detaches', () => {
    expect(detachOnEditDecision({ ...base, recurrenceSteps: 1 })).toBe('detach')
  })

  it('series mode or a one-off: nothing', () => {
    expect(detachOnEditDecision({ ...base, editMode: 'series' })).toBe('none')
    expect(detachOnEditDecision({ ...base, isSeriesRow: false })).toBe('none')
  })

  it('details wires the propagate step into the close Undo', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, '..', 'features/task/TaskDetailsSheet/index.tsx'), 'utf8')
    expect(src).toMatch(/store\.commitSeriesEdits\(todo\.id, \{ fields \}, \{ silent: true \}\)/)
    expect(src).toMatch(/recurrenceStepsRef\.current\.push\(\{ rowAfter, undo \}\)/)
  })
})
