// @vitest-environment happy-dom
/**
 * NotifyProvider's snackbar slot (RN primitives replaced by inert hosts):
 *   - a low-priority (`queue`) snackbar — the reminder "Open" offer — never
 *     clobbers a visible Undo; it shows once the Undo ends, for its full time
 *   - an Undo replacing a visible offer re-queues the offer
 *   - an account change drops Undo / offer snackbars but keeps the ones meant
 *     to outlive it ("Your data has been cleared.")
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { renderHook, act, cleanup } from '@testing-library/react'

vi.mock('react-native', () => {
  const host = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
  const anim = { start: () => {} }
  return {
    View: host,
    Text: host,
    TouchableOpacity: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) =>
      React.createElement('button', { onClick: onPress }, children),
    Animated: {
      View: host,
      Value: class {
        constructor(public v: number) {}
      },
      timing: () => anim,
      parallel: () => anim,
    },
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
    AccessibilityInfo: { announceForAccessibility: () => {} },
    Platform: { OS: 'ios' },
  }
})
vi.mock('../app/theme', () => ({ useTheme: () => ({}) }))

import { NotifyProvider, useNotify } from '../app/notify'

function setup() {
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(NotifyProvider, null, children)
  return renderHook(() => useNotify(), { wrapper })
}

describe('NotifyProvider snackbar slot', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('a queued offer waits for the visible Undo, then gets its full duration', () => {
    const hook = setup()
    const undo = vi.fn()
    const open = vi.fn()
    act(() => hook.result.current.showSnackbar({ message: 'Done', actionLabel: 'Undo', onAction: undo, durationMs: 1000 }))
    act(() => hook.result.current.showSnackbar({ message: 'Reminder', actionLabel: 'Open', onAction: open, durationMs: 5000, queue: true }))
    expect(document.body.textContent).toContain('Done')
    expect(document.body.textContent).not.toContain('Reminder')
    act(() => vi.advanceTimersByTime(1000))
    expect(document.body.textContent).toContain('Reminder')
    act(() => vi.advanceTimersByTime(4999))
    expect(document.body.textContent).toContain('Reminder')
    act(() => vi.advanceTimersByTime(1))
    expect(document.body.textContent).not.toContain('Reminder')
  })

  it('an Undo replacing a visible offer brings the offer back afterwards', () => {
    const hook = setup()
    act(() => hook.result.current.showSnackbar({ message: 'Reminder', durationMs: 5000, queue: true }))
    act(() => hook.result.current.showSnackbar({ message: 'Done', durationMs: 1000 }))
    expect(document.body.textContent).toContain('Done')
    expect(document.body.textContent).not.toContain('Reminder')
    act(() => vi.advanceTimersByTime(1000))
    expect(document.body.textContent).toContain('Reminder')
  })

  it('a newer offer replaces a visible one directly', () => {
    const hook = setup()
    act(() => hook.result.current.showSnackbar({ message: 'Reminder A', durationMs: 5000, queue: true }))
    act(() => hook.result.current.showSnackbar({ message: 'Reminder B', durationMs: 5000, queue: true }))
    expect(document.body.textContent).toContain('Reminder B')
    act(() => vi.advanceTimersByTime(5000))
    expect(document.body.textContent).not.toContain('Reminder')
  })

  it('an account change drops Undo and waiting offers, keeps "outlives account" ones', () => {
    const hook = setup()
    act(() => hook.result.current.showSnackbar({ message: 'Done', durationMs: 5000 }))
    act(() => hook.result.current.showSnackbar({ message: 'Reminder', durationMs: 5000, queue: true }))
    act(() => hook.result.current.dismissSnackbar({ accountChange: true }))
    expect(document.body.textContent).not.toContain('Done')
    expect(document.body.textContent).not.toContain('Reminder')
    act(() => hook.result.current.showSnackbar({ message: 'Your data has been cleared.', outlivesAccount: true }))
    act(() => hook.result.current.dismissSnackbar({ accountChange: true }))
    expect(document.body.textContent).toContain('Your data has been cleared.')
    // A plain dismiss (the ×) still hides it.
    act(() => hook.result.current.dismissSnackbar())
    expect(document.body.textContent).not.toContain('cleared')
  })

  it('merged Undo toasts still stack under one mergeKey', () => {
    const hook = setup()
    const calls: string[] = []
    const show = (n: string) =>
      hook.result.current.showSnackbar({
        message: n,
        actionLabel: 'Undo',
        onAction: () => calls.push(n),
        mergeKey: 'done',
        mergedMessage: (c) => `${c} done`,
      })
    act(() => show('a'))
    act(() => show('b'))
    expect(document.body.textContent).toContain('2 done')
  })

  it('a queued offer that can no longer be seen when the Undo ends is handed back, not played hidden', () => {
    const hook = setup()
    let visible = true
    const onBlocked = vi.fn()
    act(() => hook.result.current.showSnackbar({ message: 'Added', actionLabel: 'Undo', durationMs: 1000 }))
    act(() =>
      hook.result.current.showSnackbar({
        message: 'Reminder',
        durationMs: 8000,
        queue: true,
        canShow: () => visible,
        onBlocked,
      }),
    )
    // A sheet opened over the app meanwhile.
    visible = false
    act(() => vi.advanceTimersByTime(1000))
    expect(onBlocked).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain('Reminder')
    expect(document.body.textContent).not.toContain('Added')
  })

  it('a queued offer that can be seen plays normally (canShow re-checked when the slot frees)', () => {
    const hook = setup()
    const canShow = vi.fn(() => true)
    const onBlocked = vi.fn()
    act(() => hook.result.current.showSnackbar({ message: 'Added', durationMs: 1000 }))
    act(() => hook.result.current.showSnackbar({ message: 'Reminder', durationMs: 8000, queue: true, canShow, onBlocked }))
    expect(canShow).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1000))
    expect(canShow).toHaveBeenCalled()
    expect(onBlocked).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Reminder')
  })

  it('a queued offer shown straight away is also checked', () => {
    const hook = setup()
    const onBlocked = vi.fn()
    act(() => hook.result.current.showSnackbar({ message: 'Reminder', queue: true, canShow: () => false, onBlocked }))
    expect(onBlocked).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain('Reminder')
  })

  it('a waiting snackbar meant to outlive the account survives an account change', () => {
    const hook = setup()
    act(() => hook.result.current.showSnackbar({ message: 'Done', durationMs: 1000 }))
    act(() => hook.result.current.showSnackbar({ message: 'Kept', durationMs: 5000, queue: true, outlivesAccount: true }))
    act(() => hook.result.current.dismissSnackbar({ accountChange: true }))
    expect(document.body.textContent).not.toContain('Done')
    expect(document.body.textContent).toContain('Kept')
  })

  it('retractSnackbar drops a single toast whose action ran elsewhere', () => {
    const hook = setup()
    const undo = vi.fn()
    act(() => hook.result.current.showSnackbar({ message: 'Completed', actionLabel: 'Undo', onAction: undo }))
    // Not showing → no-op.
    act(() => hook.result.current.retractSnackbar(() => {}))
    expect(document.body.textContent).toContain('Completed')
    act(() => hook.result.current.retractSnackbar(undo))
    expect(document.body.textContent).not.toContain('Completed')
    expect(undo).not.toHaveBeenCalled()
  })

  it('retractSnackbar removes only its part of a merged toast', () => {
    const hook = setup()
    const a = vi.fn()
    const b = vi.fn()
    const c = vi.fn()
    const show = (message: string, onAction: () => void) =>
      hook.result.current.showSnackbar({
        message,
        actionLabel: 'Undo',
        onAction,
        mergeKey: 'done',
        mergedMessage: (n) => `${n} completed`,
        mergedActionLabel: 'Undo all',
      })
    act(() => show('Completed A', a))
    act(() => show('Completed B', b))
    act(() => show('Completed C', c))
    expect(document.body.textContent).toContain('3 completed')
    act(() => hook.result.current.retractSnackbar(b))
    expect(document.body.textContent).toContain('2 completed')
    act(() => hook.result.current.retractSnackbar(c))
    // Back to the remaining single toast, with its own label.
    expect(document.body.textContent).toContain('Completed A')
    expect(document.body.textContent).toContain('Undo')
    expect(document.body.textContent).not.toContain('Undo all')
    // A re-completion merges into "2 completed", not "3".
    act(() => show('Completed B', b))
    expect(document.body.textContent).toContain('2 completed')
  })

  it('after a retract, "Undo all" runs only the remaining actions, newest first', () => {
    const hook = setup()
    const order: string[] = []
    const mk = (n: string) => () => order.push(n)
    const a = mk('a')
    const b = mk('b')
    const c = mk('c')
    const show = (onAction: () => void) =>
      hook.result.current.showSnackbar({ message: 'x', actionLabel: 'Undo', onAction, mergeKey: 'k', mergedMessage: (n) => `${n} x` })
    act(() => show(a))
    act(() => show(b))
    act(() => show(c))
    act(() => hook.result.current.retractSnackbar(b))
    expect(document.body.textContent).toContain('2 x')
    const undoBtn = Array.from(document.querySelectorAll('button')).find((el) => el.textContent === 'Undo')!
    act(() => undoBtn.click())
    expect(order).toEqual(['c', 'a'])
    expect(document.body.textContent).not.toContain('2 x')
  })
})
