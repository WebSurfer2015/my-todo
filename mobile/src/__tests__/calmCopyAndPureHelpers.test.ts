/**
 * Small pure helpers behind round-5 fixes:
 *   - store snackbar copy (series commit, single-day defer, category delete)
 *   - ChatSheet's `undoOutcome` (void / boolean / Promise<boolean>)
 *   - details' step-done footer plan
 *   - alertWithPresence counts an Alert until it's answered
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Alert } from 'react-native'
import { seriesCommitMessage, deferredMessage } from '../store/slices/useTodosSlice'
import { categoryDeletedMessage, EXPORT_FAILED_MESSAGE } from '../app/sheetMessages'
import { undoOutcome } from '../features/mochi/undoOutcome'
import { planStepDoneFooter, stepDoneUndoAfterToggle } from '../features/task/TaskDetailsSheet/stepDoneFooter'
import { alertWithPresence, isAnyModalPresented, __resetModalPresenceForTests } from '../app/modalPresence'
import { MODAL_DISMISS_GRACE_MS } from '../app/modalTiming'

describe('store snackbar copy', () => {
  it('names what a series commit did', () => {
    expect(seriesCommitMessage({ kind: 'fields', affected: 0 })).toBe('Changes saved')
    expect(seriesCommitMessage({ kind: 'fields', affected: 1 })).toBe('Applied to 1 upcoming to-do')
    expect(seriesCommitMessage({ kind: 'fields', affected: 3 })).toBe('Applied to 3 upcoming to-dos')
    expect(seriesCommitMessage({ kind: 'steps', affected: 0 })).toBe('Changes saved')
    expect(seriesCommitMessage({ kind: 'steps', affected: 2 })).toBe('Steps applied to 2 upcoming to-dos')
    expect(seriesCommitMessage({ kind: 'rule', replaced: 0 })).toBe('Repeat updated')
    expect(seriesCommitMessage({ kind: 'rule', replaced: 2 })).toBe('Repeat updated · 2 upcoming to-dos replaced')
  })

  it('a single defer names the day; several are counted', () => {
    expect(deferredMessage(1, '2026-10-21')).toBe('Deferred to Wed, Oct 21')
    expect(deferredMessage(3, '2026-10-21')).toBe('3 to-dos deferred.')
    expect(deferredMessage(0, '2026-10-21')).toBe('0 to-dos deferred.')
    expect(deferredMessage(1, 'garbage')).toBe('1 to-do deferred.')
  })

  it('category delete says how many to-dos went to Done', () => {
    expect(categoryDeletedMessage(0)).toBe('Category deleted')
    expect(categoryDeletedMessage(1)).toBe('Category deleted · 1 to-do tucked into Done')
    expect(categoryDeletedMessage(4)).toBe('Category deleted · 4 to-dos tucked into Done')
  })

  it('export failure is calm copy', () => {
    expect(EXPORT_FAILED_MESSAGE).toBe("Couldn't prepare your export just now. Please try again.")
  })
})

describe('undoOutcome', () => {
  it('no Undo → false', async () => {
    expect(await undoOutcome(undefined)).toBe(false)
  })
  it('void → undone; boolean is taken as is', async () => {
    const fn = vi.fn()
    expect(await undoOutcome(fn)).toBe(true)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(await undoOutcome(() => true)).toBe(true)
    expect(await undoOutcome(() => false)).toBe(false)
  })
  it('awaits a Promise<boolean> (an Undo that asks first)', async () => {
    expect(await undoOutcome(() => Promise.resolve(true))).toBe(true)
    expect(await undoOutcome(() => Promise.resolve(false))).toBe(false)
  })
})

describe('step-done footer', () => {
  const undo = () => {}
  const steps = (...done: boolean[]) => done.map((d, i) => ({ id: `s${i}`, done: d }))

  it('keeps the Undo only when the toggle finished the LAST open step', () => {
    expect(stepDoneUndoAfterToggle({ subtasks: steps(true, false) }, 's1', undo)).toBe(undo)
    // Not the last open step.
    expect(stepDoneUndoAfterToggle({ subtasks: steps(false, false) }, 's1', null)).toBeNull()
    expect(stepDoneUndoAfterToggle({ subtasks: steps(false, false) }, 's1', undo)).toBeNull()
    // Re-opening a done step on a done to-do.
    expect(stepDoneUndoAfterToggle({ done: true, subtasks: steps(true, true) }, 's1', undo)).toBeNull()
    // No Undo from the store (no-op).
    expect(stepDoneUndoAfterToggle({ subtasks: steps(true, false) }, 's1', null)).toBeNull()
  })

  it('shows the "✓ Done · Undo" row over the Done-bin footer while it applies', () => {
    expect(planStepDoneFooter(undo, { done: true, trashed: true })).toEqual({ showStepDoneRow: true, isBinFooter: false })
    expect(planStepDoneFooter(undo, { done: false, trashed: false })).toEqual({ showStepDoneRow: false, isBinFooter: false })
    expect(planStepDoneFooter(null, { done: true, trashed: true })).toEqual({ showStepDoneRow: false, isBinFooter: true })
    expect(planStepDoneFooter(null, { done: false })).toEqual({ showStepDoneRow: false, isBinFooter: false })
  })
})

describe('alertWithPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetModalPresenceForTests()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  type Btn = { text?: string; onPress?: () => void }
  const capture = () => {
    const calls: Array<{ buttons: Btn[]; options?: { onDismiss?: () => void } }> = []
    vi.spyOn(Alert, 'alert').mockImplementation((...args: unknown[]) => {
      calls.push({ buttons: args[2] as Btn[], options: args[3] as { onDismiss?: () => void } })
    })
    return calls
  }

  it('counts as presented until a button is pressed (+ the dismiss grace), then runs it', () => {
    const calls = capture()
    const del = vi.fn()
    alertWithPresence('Delete?', 'Gone for good', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', onPress: del }])
    expect(isAnyModalPresented()).toBe(true)
    calls[0].buttons[1].onPress!()
    expect(del).toHaveBeenCalledTimes(1)
    expect(isAnyModalPresented()).toBe(true)
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    expect(isAnyModalPresented()).toBe(false)
  })

  it('a dismiss releases it once (a later press is not double-counted); default OK button', () => {
    const calls = capture()
    const onDismiss = vi.fn()
    alertWithPresence('Heads up', undefined, undefined, { onDismiss })
    expect(calls[0].buttons.map((b) => b.text)).toEqual(['OK'])
    alertWithPresence('Second')
    calls[0].options!.onDismiss!()
    calls[0].buttons[0].onPress!()
    expect(onDismiss).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    // The second Alert is still up.
    expect(isAnyModalPresented()).toBe(true)
    calls[1].buttons[0].onPress!()
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    expect(isAnyModalPresented()).toBe(false)
  })
})
