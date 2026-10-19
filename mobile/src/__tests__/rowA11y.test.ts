/**
 * TaskItem's VoiceOver label + custom actions (pure): the row is one
 * accessibility element, so its chips are spoken in the label and its swipe
 * actions are offered as custom actions.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rowAccessibilityActions, rowAccessibilityLabel, type RowA11yLabelInput } from '../features/task/TaskItem/rowA11y'

const base: RowA11yLabelInput = {
  text: 'Water plants',
  dateLabel: null,
  dateKind: 'due',
  priority: 'medium',
  recurring: false,
  categoryLabel: null,
  hasReminder: false,
  steps: null,
  done: false,
  skipped: false,
  trashed: false,
}

describe('rowAccessibilityLabel', () => {
  it('speaks every chip: date, priority, repeat, category, reminder, steps', () => {
    expect(
      rowAccessibilityLabel({
        ...base,
        dateLabel: 'Tomorrow',
        priority: 'high',
        recurring: true,
        categoryLabel: 'Home',
        hasReminder: true,
        steps: { done: 1, total: 3 },
      }),
    ).toBe('Water plants, Complete by Tomorrow, high priority, repeats, Home, has a reminder, 1 of 3 steps done')
  })

  it('a carried-over row names the day it was for', () => {
    expect(rowAccessibilityLabel({ ...base, dateLabel: 'Mon, Oct 5', dateKind: 'carriedOver' })).toBe(
      'Water plants, carried over, Mon, Oct 5, medium priority',
    )
  })

  it('a Done-bin chip is spoken as-is', () => {
    expect(
      rowAccessibilityLabel({ ...base, done: true, trashed: true, dateLabel: 'Done Mon, Oct 5', dateKind: 'status' }),
    ).toBe('Water plants, completed, Done Mon, Oct 5, medium priority')
  })

  it('no date chip → no date; minimal row', () => {
    expect(rowAccessibilityLabel(base)).toBe('Water plants, medium priority')
  })

  it('states: skipped beats removed; removed when trashed and not done', () => {
    expect(rowAccessibilityLabel({ ...base, skipped: true, trashed: true })).toContain('skipped')
    expect(rowAccessibilityLabel({ ...base, skipped: true, trashed: true })).not.toContain('removed')
    expect(rowAccessibilityLabel({ ...base, trashed: true })).toContain(', removed,')
  })
})

describe('rowAccessibilityActions', () => {
  const open = { inTrash: false, isBin: false, hasSubs: false, canDefer: true, canRestore: true, canDeleteForever: true }

  it('an open row offers what its swipes do', () => {
    expect(rowAccessibilityActions(open)).toEqual(['toggleDone', 'edit', 'defer', 'skip', 'delete'])
  })

  it('a parent with steps: steps toggle, no Edit / Skip (the swipes hide them too)', () => {
    expect(rowAccessibilityActions({ ...open, hasSubs: true })).toEqual(['toggleDone', 'toggleSteps', 'defer', 'delete'])
  })

  it('no defer handler → no Defer', () => {
    expect(rowAccessibilityActions({ ...open, canDefer: false })).not.toContain('defer')
  })

  it('a bin row: Reopen (restore) + Delete forever, no second Reopen', () => {
    expect(rowAccessibilityActions({ ...open, isBin: true })).toEqual(['restore', 'deleteForever'])
  })

  it('a bin row without a restore handler falls back to the toggle', () => {
    expect(rowAccessibilityActions({ ...open, isBin: true, canRestore: false, canDeleteForever: false })).toEqual(['toggleDone'])
  })

  it('the trash view never offers the completion toggle', () => {
    expect(rowAccessibilityActions({ ...open, inTrash: true, isBin: true, canRestore: false })).toEqual(['deleteForever'])
  })
})

describe('TaskItem wiring (source guard)', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', 'features/task/TaskItem/index.tsx'), 'utf8')

  it('the row Pressable uses the helpers and routes every action', () => {
    expect(src).toMatch(/accessibilityLabel=\{rowA11yLabel\}/)
    expect(src).toMatch(/onAccessibilityAction=\{\(e\) => runRowA11yAction\(e\.nativeEvent\.actionName\)\}/)
    for (const name of ['toggleDone', 'toggleSteps', 'edit', 'defer', 'skip', 'delete', 'restore', 'deleteForever']) {
      expect(src).toMatch(new RegExp(`case '${name}':`))
    }
  })
})
