/**
 * UX review — to-do sheets (2026-10-19):
 *   - step meta (priority dot / date) shows only when set AND different from
 *     the to-do's own
 *   - the details body's bottom inset grows with Dynamic Type
 *   - Compose's "More details" opens on its own when a hidden field has a value
 *   - source guards for the sheet shapes RN can't render in vitest
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stepMetaVisibility, detailsBodyBottomInset } from '../features/task/TaskDetailsSheet/stepMeta'
import { composeDetailsHaveValue, type ComposeDetailFields } from '../features/task/ComposeSheet/moreDetails'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8')

describe('stepMetaVisibility', () => {
  const parent = { priority: 'medium' as const, dueDate: '2026-10-24' }

  it('hides a step priority / date that match the to-do', () => {
    expect(stepMetaVisibility({ priority: 'medium', dueDate: '2026-10-24' }, parent)).toEqual({
      showPriority: false,
      showDate: false,
    })
  })

  it('hides unset step meta', () => {
    expect(stepMetaVisibility({}, parent)).toEqual({ showPriority: false, showDate: false })
  })

  it('shows a step priority / date that differ', () => {
    expect(stepMetaVisibility({ priority: 'high', dueDate: '2026-10-25' }, parent)).toEqual({
      showPriority: true,
      showDate: true,
    })
  })

  it('compares dates by day (a time on either side does not count)', () => {
    expect(stepMetaVisibility({ dueDate: '2026-10-24T15:00' }, parent).showDate).toBe(false)
    expect(
      stepMetaVisibility({ dueDate: '2026-10-24' }, { priority: 'low', dueDate: '2026-10-24T09:30' }).showDate,
    ).toBe(false)
  })

  it('shows a step date when the to-do has none', () => {
    expect(stepMetaVisibility({ dueDate: '2026-10-24' }, { priority: 'low' }).showDate).toBe(true)
  })
})

describe('detailsBodyBottomInset', () => {
  it('keeps the base inset at default text size (or a bad scale)', () => {
    expect(detailsBodyBottomInset(1)).toBe(16)
    expect(detailsBodyBottomInset(0.85)).toBe(16)
    expect(detailsBodyBottomInset(NaN)).toBe(16)
    expect(detailsBodyBottomInset(0)).toBe(16)
  })

  it('grows with Dynamic Type', () => {
    const xxl = detailsBodyBottomInset(1.35)
    expect(xxl).toBeGreaterThan(16 + 32)
    expect(detailsBodyBottomInset(3)).toBeGreaterThan(xxl)
  })
})

describe('composeDetailsHaveValue', () => {
  const blank: ComposeDetailFields = { priority: 'medium', reminders: [], notes: '', subtasks: [] }

  it('a blank compose stays collapsed', () => {
    expect(composeDetailsHaveValue(blank)).toBe(false)
    expect(composeDetailsHaveValue({ ...blank, notes: '   ' })).toBe(false)
  })

  it.each<[string, Partial<ComposeDetailFields>]>([
    ['a non-default priority', { priority: 'high' }],
    ['a repeat', { recurrence: { freq: 'weekly' } }],
    ['a reminder', { reminders: [{ id: 'r1', at: '2026-10-24T09:00' }] }],
    ['notes', { notes: 'bring the receipt' }],
    ['a step', { subtasks: [{ id: 's1', text: 'Call', done: false }] }],
  ])('%s opens it', (_label, patch) => {
    expect(composeDetailsHaveValue({ ...blank, ...patch })).toBe(true)
  })
})

describe('sheet source guards', () => {
  it('the + button always opens Ask Mochi when AI is on — no remembered surface', () => {
    const ctx = read('app/SheetContext.tsx')
    expect(ctx).not.toMatch(/lastComposeMode/)
    const fn = /const openCapture = useCallback\([\s\S]*?\}, \[[^\]]*\]\)/.exec(ctx)?.[0] ?? ''
    expect(fn).toMatch(/if \(agentOn\) showMochi\(\)/)
    expect(fn).toMatch(/else openCompose\(\)/)
  })

  it('ReminderSheet: one Done, Clear all only when set, no empty block', () => {
    const src = read('features/task/ReminderSheet/index.tsx')
    expect(src).not.toMatch(/t\.back\b/)
    expect(src).not.toMatch(/onCancel/)
    expect(src).toMatch(/\{hasReminders \? \(\s*<TouchableOpacity\s+onPress=\{clearAll\}/)
    expect(src).not.toMatch(/remindEmpty/)
  })

  it('details: Complete by → Repeat → Repeat ends → Remind me; locked repeat is one readable line', () => {
    const src = read('features/task/TaskDetailsSheet/index.tsx')
    const order = [
      't.edit.completedBy}</Text>',
      'change in Edit series',
      't.edit.repeat}</Text>',
      't.edit.repeatEnds}</Text>',
      't.remindMe}</Text>',
    ].map((needle) => src.lastIndexOf(needle))
    expect(order.every((i) => i > 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(src).toMatch(/onPress=\{\(\) => setEditMode\('series'\)\}/)
    expect(src).not.toMatch(/Series only/)
    expect(src).not.toMatch(/editFieldRowDisabled/)
  })

  it('details: Clear all steps lives in the STEPS "…" menu, neutral', () => {
    const src = read('features/task/TaskDetailsSheet/index.tsx')
    const fn = /function openStepsMenu\(\) \{[\s\S]*?\n {2}\}\n/.exec(src)?.[0] ?? ''
    expect(fn).toMatch(/actionSheetWithPresence/)
    expect(fn).not.toMatch(/destructive/)
    expect(src).toMatch(/accessibilityLabel="Step options"/)
  })

  it('compose: the date chip clears from inside the chip; details sit behind a disclosure', () => {
    const src = read('features/task/ComposeSheet/index.tsx')
    expect(src).toMatch(/accessibilityLabel="Clear date"/)
    expect(src).not.toMatch(/styles\.chipClear\b/)
    expect(src).toMatch(/\{moreOpen && \(/)
  })
})
