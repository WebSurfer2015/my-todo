/**
 * Small pure helpers behind round-5 fixes:
 *   - store snackbar copy (series commit, single-day defer, category delete)
 *   - Ask Mochi's `undoResult` (void / boolean / 'partial' / Promise of one)
 *     and the capture card's footer after its final Undo
 *   - details' step-done footer plan
 *   - alertWithPresence / actionSheetWithPresence count until answered
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ActionSheetIOS, Alert, AppState } from 'react-native'
import { seriesCommitMessage, deferredMessage } from '../store/slices/useTodosSlice'
import { categoryDeletedMessage, EXPORT_FAILED_MESSAGE } from '../app/sheetMessages'
import { undoResult } from '../features/mochi/undoOutcome'
import { addedReplyText, captureCardRemovalNote, isCaptureCardEditable } from '../features/mochi/captureCardEditable'
import { planStepDoneFooter, stepDoneUndoAfterToggle } from '../features/task/TaskDetailsSheet/stepDoneFooter'
import { ACTION_SHEET_MAX_PRESENCE_MS, actionSheetWithPresence, alertWithPresence, isAnyModalPresented, __resetModalPresenceForTests } from '../app/modalPresence'
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

describe('undoResult', () => {
  it('no Undo → nothing', async () => {
    expect(await undoResult(undefined)).toBe('nothing')
    expect(await undoResult(null)).toBe('nothing')
  })
  it('void → undone; a boolean / partial is taken as is', async () => {
    const fn = vi.fn()
    expect(await undoResult(fn)).toBe('undone')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(await undoResult(() => true)).toBe('undone')
    expect(await undoResult(() => false)).toBe('nothing')
    expect(await undoResult(() => 'partial')).toBe('partial')
  })
  it('awaits a Promise of an outcome', async () => {
    expect(await undoResult(() => Promise.resolve(true))).toBe('undone')
    expect(await undoResult(() => Promise.resolve(false))).toBe('nothing')
    expect(await undoResult(() => Promise.resolve('partial' as const))).toBe('partial')
  })
})

describe('captureCardRemovalNote', () => {
  it('says "Removed" only when the to-do was actually removed', () => {
    expect(captureCardRemovalNote('undone')).toBe('Removed')
    expect(captureCardRemovalNote('partial')).toBe('Undone — later changes were kept.')
    expect(captureCardRemovalNote('nothing')).toBe('Nothing to undo')
  })
})

describe('step-done footer', () => {
  const undo = () => {}

  it('keeps the Undo only when the store turned an open to-do done', () => {
    const open = { done: false }
    const done = { done: true }
    // Completed by the toggle (the store's result says so).
    expect(stepDoneUndoAfterToggle(open, done, undo)).toBe(undo)
    expect(stepDoneUndoAfterToggle({}, done, undo)).toBe(undo)
    // Still open (not the last open step).
    expect(stepDoneUndoAfterToggle(open, open, undo)).toBeNull()
    // Already done: toggling a step on a done to-do never offers it.
    expect(stepDoneUndoAfterToggle(done, done, undo)).toBeNull()
    // Re-opened by the toggle.
    expect(stepDoneUndoAfterToggle(done, open, undo)).toBeNull()
    // No Undo from the store (no-op).
    expect(stepDoneUndoAfterToggle(open, done, null)).toBeNull()
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

  it('a dismiss alone (no button) releases it after the grace', () => {
    const calls = capture()
    alertWithPresence('Heads up')
    expect(isAnyModalPresented()).toBe(true)
    calls[0].options!.onDismiss!()
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    expect(isAnyModalPresented()).toBe(false)
  })
})

describe('actionSheetWithPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetModalPresenceForTests()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  const capture = () => {
    const calls: Array<{ options: unknown; cb: (i: number) => void }> = []
    vi.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((options, cb) => {
      calls.push({ options, cb })
    })
    return calls
  }

  it('counts as presented until its callback fires, then runs it with the index', () => {
    const calls = capture()
    const cb = vi.fn()
    const opts = { options: ['Pin', 'Cancel'], cancelButtonIndex: 1 }
    actionSheetWithPresence(opts, cb)
    expect(calls[0].options).toBe(opts)
    expect(isAnyModalPresented()).toBe(true)
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS * 10)
    expect(isAnyModalPresented()).toBe(true)
    calls[0].cb(0)
    expect(cb).toHaveBeenCalledWith(0)
    expect(isAnyModalPresented()).toBe(true)
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    expect(isAnyModalPresented()).toBe(false)
  })

  it('cancel / outside tap (the cancel index) releases too, exactly once', () => {
    const calls = capture()
    actionSheetWithPresence({ options: ['Pin', 'Cancel'], cancelButtonIndex: 1 }, () => {})
    actionSheetWithPresence({ options: ['Pin', 'Cancel'], cancelButtonIndex: 1 }, () => {})
    calls[0].cb(1)
    calls[0].cb(1)
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    // The second sheet is still up (a double callback didn't uncount it).
    expect(isAnyModalPresented()).toBe(true)
    calls[1].cb(1)
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    expect(isAnyModalPresented()).toBe(false)
  })

  it('a callback that never fires (sheet never presented) auto-releases after the max lifetime', () => {
    const calls = capture()
    const cb = vi.fn()
    actionSheetWithPresence({ options: ['Pin', 'Cancel'], cancelButtonIndex: 1 }, cb)
    vi.advanceTimersByTime(ACTION_SHEET_MAX_PRESENCE_MS - 1)
    expect(isAnyModalPresented()).toBe(true)
    vi.advanceTimersByTime(1 + MODAL_DISMISS_GRACE_MS)
    // Not leaked: details can open again.
    expect(isAnyModalPresented()).toBe(false)
    expect(cb).not.toHaveBeenCalled()
    // A very late callback still runs, and can't uncount another sheet.
    actionSheetWithPresence({ options: ['Pin', 'Cancel'], cancelButtonIndex: 1 }, () => {})
    calls[0].cb(1)
    expect(cb).toHaveBeenCalledWith(1)
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    expect(isAnyModalPresented()).toBe(true)
    calls[1].cb(1) // answer it so its AppState listener doesn't leak
  })

  it('an answered sheet cancels its max-lifetime timer', () => {
    const calls = capture()
    actionSheetWithPresence({ options: ['Pin', 'Cancel'], cancelButtonIndex: 1 }, () => {})
    calls[0].cb(0)
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    expect(vi.getTimerCount()).toBe(0)
  })

  const stubAppState = AppState as unknown as { __emit: (s: string) => void; __listenerCount: () => number }

  it('the max lifetime pauses while backgrounded and re-arms a fresh one on return', () => {
    const before = stubAppState.__listenerCount()
    try {
      capture()
      actionSheetWithPresence({ options: ['Pin', 'Cancel'], cancelButtonIndex: 1 }, () => {})
      vi.advanceTimersByTime(ACTION_SHEET_MAX_PRESENCE_MS - 1000)
      stubAppState.__emit('background')
      // Backgrounded far past the lifetime: the sheet is still up on return.
      vi.advanceTimersByTime(ACTION_SHEET_MAX_PRESENCE_MS * 5)
      expect(isAnyModalPresented()).toBe(true)
      stubAppState.__emit('active')
      // A fresh full lifetime, not the 1s that was left.
      vi.advanceTimersByTime(ACTION_SHEET_MAX_PRESENCE_MS - 1)
      expect(isAnyModalPresented()).toBe(true)
      vi.advanceTimersByTime(1 + MODAL_DISMISS_GRACE_MS)
      expect(isAnyModalPresented()).toBe(false)
      // Released: its AppState listener is gone.
      expect(stubAppState.__listenerCount()).toBe(before)
    } finally {
      stubAppState.__emit('active')
    }
  })

  it('a sheet opened while not active only starts its lifetime once active', () => {
    try {
      capture()
      stubAppState.__emit('inactive')
      actionSheetWithPresence({ options: ['Pin', 'Cancel'], cancelButtonIndex: 1 }, () => {})
      vi.advanceTimersByTime(ACTION_SHEET_MAX_PRESENCE_MS * 2)
      expect(isAnyModalPresented()).toBe(true)
      stubAppState.__emit('active')
      vi.advanceTimersByTime(ACTION_SHEET_MAX_PRESENCE_MS + MODAL_DISMISS_GRACE_MS)
      expect(isAnyModalPresented()).toBe(false)
    } finally {
      stubAppState.__emit('active')
    }
  })

  it('an answered sheet removes its AppState listener', () => {
    const calls = capture()
    const before = stubAppState.__listenerCount()
    actionSheetWithPresence({ options: ['Pin', 'Cancel'], cancelButtonIndex: 1 }, () => {})
    expect(stubAppState.__listenerCount()).toBe(before + 1)
    calls[0].cb(1)
    expect(stubAppState.__listenerCount()).toBe(before)
  })
})

describe('isCaptureCardEditable', () => {
  it.each([
    [true, false, true],
    [true, true, false],
    [false, false, false],
    [false, true, false],
  ])('undoLive=%s removed=%s → %s', (undoLive, removed, expected) => {
    expect(isCaptureCardEditable(undoLive, removed)).toBe(expected)
  })
})

describe('addedReplyText — an already-added capture reads in the past tense', () => {
  it('turns a promise into what happened', () => {
    expect(addedReplyText("I'll add milk to your shopping list.")).toBe('Added milk to your shopping list.')
    expect(addedReplyText('I will add the dentist for Friday.')).toBe('Added the dentist for Friday.')
    expect(addedReplyText("I'll put gym on Monday.")).toBe('Added gym on Monday.')
  })
  it('leaves other replies alone', () => {
    expect(addedReplyText('Added milk.')).toBe('Added milk.')
    expect(addedReplyText('Which day works?')).toBe('Which day works?')
    expect(addedReplyText("Sure — I'll add it.")).toBe("Sure — I'll add it.")
  })
})
