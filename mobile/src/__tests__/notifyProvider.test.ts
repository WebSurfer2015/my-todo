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
    TouchableOpacity: host,
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
})
