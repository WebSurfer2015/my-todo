/**
 * TaskItem's VoiceOver label + custom actions (pure): the row is one
 * accessibility element, so its chips are spoken in the label and its swipe
 * actions are offered as custom actions.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROW_A11Y_STRINGS_EN,
  rowA11yStrings,
  rowAccessibilityActions,
  rowAccessibilityLabel,
  type RowA11yLabelInput,
} from '../features/task/TaskItem/rowA11y'
import { strings } from '../core-bindings/i18n'

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
    ).toBe('Water plants, Complete by Tomorrow, High priority, repeats, Home, has a reminder, 1 of 3 steps done')
  })

  it('a carried-over row names the day it was for', () => {
    expect(rowAccessibilityLabel({ ...base, dateLabel: 'Mon, Oct 5', dateKind: 'carriedOver' })).toBe(
      'Water plants, carried over, Mon, Oct 5, Medium priority',
    )
  })

  it('a Done-bin chip is spoken as-is', () => {
    expect(
      rowAccessibilityLabel({ ...base, done: true, trashed: true, dateLabel: 'Done Mon, Oct 5', dateKind: 'status' }),
    ).toBe('Water plants, completed, Done Mon, Oct 5, Medium priority')
  })

  it('no date chip → no date; minimal row', () => {
    expect(rowAccessibilityLabel(base)).toBe('Water plants, Medium priority')
  })

  it('states: skipped beats removed; removed when trashed and not done', () => {
    expect(rowAccessibilityLabel({ ...base, skipped: true, trashed: true })).toContain('skipped')
    expect(rowAccessibilityLabel({ ...base, skipped: true, trashed: true })).not.toContain('removed')
    expect(rowAccessibilityLabel({ ...base, trashed: true })).toContain(', removed,')
  })

  it('a skipped row never says it twice ("skipped, Skipped")', () => {
    const label = rowAccessibilityLabel({ ...base, skipped: true, trashed: true, dateLabel: 'Skipped', dateKind: 'status' })
    expect(label).toBe('Water plants, skipped, Medium priority')
  })

  it("a done row outside the bin speaks its plain day, not 'Complete by'", () => {
    expect(rowAccessibilityLabel({ ...base, done: true, dateLabel: 'Mon, Oct 5', dateKind: 'status' })).toBe(
      'Water plants, completed, Mon, Oct 5, Medium priority',
    )
  })

  it('speaks the priority display label, never the raw enum', () => {
    const label = rowAccessibilityLabel({ ...base, priority: 'low' })
    expect(label).toContain('Low priority')
    expect(label).not.toContain('low priority')
  })

  it('takes its words from the strings it is given', () => {
    const s = {
      ...ROW_A11Y_STRINGS_EN,
      completeBy: 'Due',
      completed: 'finished',
      priorityLabels: { high: 'Urgent', medium: 'Normal', low: 'Later' },
      priority: (l: string) => `priority ${l}`,
      steps: (d: number, t: number) => `${d}/${t} steps`,
    }
    expect(
      rowAccessibilityLabel({ ...base, done: true, dateLabel: 'Tomorrow', priority: 'high', steps: { done: 1, total: 2 } }, s),
    ).toBe('Water plants, finished, Due Tomorrow, priority Urgent, 1/2 steps')
  })
})

describe('rowA11yStrings', () => {
  it('uses t where it has a key, English for the rest', () => {
    const s = rowA11yStrings(strings.en)
    expect(s.completeBy).toBe(strings.en.composeDateLabel)
    expect(s.priorityLabels).toEqual(strings.en.priority)
    expect(s.showSteps).toBe('Show steps')
    expect(s.hideSteps).toBe('Hide steps')
  })

  it('falls back to English when t is missing keys', () => {
    const s = rowA11yStrings({})
    expect(s.completeBy).toBe('Complete by')
    expect(s.priorityLabels).toEqual({ high: 'High', medium: 'Medium', low: 'Low' })
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

  it('the trash view never offers the steps toggle (its rows hide the steps)', () => {
    expect(rowAccessibilityActions({ ...open, isBin: true, inTrash: true, hasSubs: true })).not.toContain('toggleSteps')
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

  it('every row date goes through rowDateLabel; carried over only for an open, not-deleted row', () => {
    expect(src).toMatch(/const dueChipText = todo\.dueDate \? rowDateLabel\(todo\.dueDate, t\.locale, today\)/)
    expect(src).not.toMatch(/formatDisplayDate\(/)
    expect(src).toMatch(/const overdue = !!todo\.dueDate && !todo\.done && !todo\.trashed &&/)
  })

  it('no hardcoded English action labels; the label gets the localized strings', () => {
    expect(src).not.toMatch(/'(Hide|Show) steps'/)
    expect(src).toMatch(/rowA11yStrings\(t\)/)
    expect(src).not.toMatch(/Priority \$\{todo\.priority\}/)
  })

  it('the step list renders AFTER the row Pressable (own VoiceOver elements), inside the Swipeable', () => {
    const pressableClose = src.indexOf('</Pressable>\n')
    const swipeableClose = src.indexOf('</Swipeable>')
    const subList = src.indexOf('styles.subList')
    expect(pressableClose).toBeGreaterThan(0)
    expect(subList).toBeGreaterThan(pressableClose)
    expect(subList).toBeLessThan(swipeableClose)
    // Exactly one step list, and the step checkboxes live in it.
    expect(src.split('styles.subList').length).toBe(2)
    expect(src.indexOf('styles.subCheckbox')).toBeGreaterThan(pressableClose)
  })
})

describe('Compose date chip (source guard)', () => {
  it('a past date names its day, never "N days ago"', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, '..', 'features/task/ComposeSheet/index.tsx'), 'utf8')
    expect(src).toMatch(/\{dueDate \? rowDateLabel\(dueDate, t\.locale\) : t\.presetNoDate\}/)
    expect(src).not.toMatch(/dueDate \? formatDisplayDate\(dueDate/)
  })
})
