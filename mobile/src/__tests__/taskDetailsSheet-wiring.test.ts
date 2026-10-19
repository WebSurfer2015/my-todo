/**
 * TaskDetailsSheet wiring the .tsx coverage can't see:
 *   - buildSeriesCommit: which `fields` / `thisRow` an "Edit series" close
 *     sends to the store (pure — extracted from the sheet)
 *   - source guards: the sheet reports onShow (the ghost guard's "presented")
 *     and its mount (the guard's clock) to the host, and the host wires both
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSeriesCommit, type SeriesEdits } from '../features/task/TaskDetailsSheet/seriesCommit'
import type { Reminder, Todo } from '../core-bindings/types'

const R1: Reminder = { id: 'r1', at: '2026-10-20T09:00' }
const R2: Reminder = { id: 'r2', at: '2026-10-20T18:00' }

const TODO: Todo = {
  id: 't1',
  text: 'Water plants',
  done: false,
  priority: 'medium',
  dueDate: '2026-10-20',
  category: 'home',
  trashed: false,
  notes: 'balcony',
  reminders: [R1],
  seriesId: 's1',
}

/** The form as it opened: nothing edited. */
const unchanged = (td: Todo = TODO): SeriesEdits => ({
  text: td.text,
  notes: td.notes ?? '',
  priority: td.priority,
  category: td.category,
  dueDate: td.dueDate ?? '',
  reminders: td.reminders ?? [],
})

describe('buildSeriesCommit', () => {
  it('nothing changed → null (no commit, no Undo)', () => {
    expect(buildSeriesCommit(TODO, unchanged())).toBeNull()
  })

  it('whitespace-only / blank text is not a change; real text is trimmed', () => {
    expect(buildSeriesCommit(TODO, { ...unchanged(), text: '  Water plants  ' })).toBeNull()
    expect(buildSeriesCommit(TODO, { ...unchanged(), text: '   ' })).toBeNull()
    expect(buildSeriesCommit(TODO, { ...unchanged(), text: ' Water ferns ' })).toEqual({
      fields: { text: 'Water ferns' },
    })
  })

  it('each series-wide field goes in `fields` (and only the changed ones)', () => {
    expect(
      buildSeriesCommit(TODO, { ...unchanged(), notes: '', priority: 'high', category: 'work' }),
    ).toEqual({ fields: { notes: '', priority: 'high', category: 'work' } })
  })

  it('a missing notes / category compares as empty / undefined', () => {
    const bare: Todo = { ...TODO, notes: undefined, category: undefined }
    expect(buildSeriesCommit(bare, { ...unchanged(bare), notes: '' })).toBeNull()
    expect(buildSeriesCommit(bare, { ...unchanged(bare), category: 'home' })).toEqual({
      fields: { category: 'home' },
    })
  })

  it("this occurrence's date and reminders ride along as thisRow, never in fields", () => {
    expect(buildSeriesCommit(TODO, { ...unchanged(), dueDate: '2026-10-22' })).toEqual({
      fields: {},
      thisRow: { dueDate: '2026-10-22' },
    })
    expect(buildSeriesCommit(TODO, { ...unchanged(), reminders: [R1, R2] })).toEqual({
      fields: {},
      thisRow: { reminders: [R1, R2] },
    })
    expect(
      buildSeriesCommit(TODO, { ...unchanged(), text: 'X', dueDate: '', reminders: [] }),
    ).toEqual({ fields: { text: 'X' }, thisRow: { dueDate: '', reminders: [] } })
  })

  it('reminders compare against the deduped list (a duplicate stored copy is not a change)', () => {
    const dup: Todo = { ...TODO, reminders: [R1, { ...R1 }] }
    expect(buildSeriesCommit(dup, { ...unchanged(dup), reminders: [R1] })).toBeNull()
  })

  it('a dialog choice commits even with no field edits, and is passed through', () => {
    expect(
      buildSeriesCommit(TODO, unchanged(), { recurrence: { value: undefined, keepDetached: true } }),
    ).toEqual({ fields: {}, recurrence: { value: undefined, keepDetached: true } })
    expect(buildSeriesCommit(TODO, unchanged(), { subtasks: { keepDetached: false } })).toEqual({
      fields: {},
      subtasks: { keepDetached: false },
    })
    expect(
      buildSeriesCommit(TODO, { ...unchanged(), priority: 'low' }, { subtasks: { keepDetached: true } }),
    ).toEqual({ fields: { priority: 'low' }, subtasks: { keepDetached: true } })
  })
})

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8')

describe('details ghost-guard wiring (source guard)', () => {
  const sheet = read('features/task/TaskDetailsSheet/index.tsx')
  const host = read('app/SheetContext.tsx')

  it("the sheet's Modal reports onShow (without it every open is cleared as a ghost)", () => {
    const modal = /<Modal\b[^>]*>/.exec(sheet)?.[0] ?? ''
    expect(modal).toMatch(/\bonShow=\{onShown\}/)
  })

  it('the sheet reports its mount (the ghost guard clock starts there)', () => {
    expect(sheet).toMatch(/useEffect\(\(\) => \{\s*onMounted\?\.\(\)\s*\}, \[onMounted\]\)/)
  })

  it('the host passes both to the sheet', () => {
    expect(host).toMatch(/onMounted=\{detailsMounted\}/)
    expect(host).toMatch(/onShown=\{detailsShown\}/)
  })

  it('the series close commits through buildSeriesCommit', () => {
    expect(sheet).toMatch(/buildSeriesCommit\(/)
  })
})
