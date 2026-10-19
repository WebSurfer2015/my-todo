// @vitest-environment happy-dom
/**
 * useDetailsRouter — opening the ONE details sheet from a row / reminder tap
 * (SheetContext's routing, extracted so it's testable):
 *   - nothing up → opens now; something presented → PARKED, then offered as a
 *     `Reminder: “…” · Open` snackbar only once the screen is clear (a
 *     snackbar shown under a presented Modal expired unseen)
 *   - swap through details' own close path; a close that doesn't close parks
 *   - account change drops the open, queued and parked requests + handoffs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useDetailsRouter,
  type DetailsRouterDeps,
  DETAILS_OFFER_MS,
  DETAILS_SHOW_TIMEOUT_MS,
  MAX_OPEN_RETRIES,
  PARK_POLL_MS,
  PARK_TTL_MS,
} from '../app/useDetailsRouter'
import { __resetModalPresenceForTests, useModalPresence } from '../app/modalPresence'
import { MODAL_DISMISS_GRACE_MS, MODAL_HANDOFF_MS } from '../app/modalTiming'
import { AppState } from 'react-native'
import { reportNonFatal } from '../adapters/crashReporting'

vi.mock('../adapters/crashReporting', () => ({ reportNonFatal: vi.fn() }))

type Offer = Parameters<DetailsRouterDeps['showSnackbar']>[0]

const TODOS: Record<string, { text: string; trashed?: boolean }> = {
  a: { text: 'Call mom' },
  b: { text: 'Pay rent' },
  c: { text: 'Water plants' },
  t: { text: 'Old thing', trashed: true },
}

function setup(initial: Partial<{ anySheetOpen: boolean; accountUid: string | null }> = {}) {
  const offers: Offer[] = []
  const showSnackbar = vi.fn((o: Offer) => {
    offers.push(o)
  })
  const findTodo = (id: string) => TODOS[id]
  const hook = renderHook(
    (p: { anySheetOpen: boolean; accountUid: string | null }) =>
      useDetailsRouter({ anySheetOpen: p.anySheetOpen, accountUid: p.accountUid, findTodo, showSnackbar }),
    { initialProps: { anySheetOpen: false, accountUid: 'u1', ...initial } },
  )
  return { hook, offers, showSnackbar }
}

/** Long enough for any parked request to see a clear screen. */
const settle = () => act(() => vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS + 3 * PARK_POLL_MS))

describe('useDetailsRouter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetModalPresenceForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens right away when nothing is up; a repeat tap is a no-op', () => {
    const { hook, showSnackbar } = setup()
    act(() => hook.result.current.openTaskDetails('a', 's1', { source: 'reminder' }))
    expect(hook.result.current.detailsReq).toEqual({ id: 'a', subtaskId: 's1' })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    expect(hook.result.current.detailsReq).toEqual({ id: 'a', subtaskId: 's1' })
    settle()
    expect(showSnackbar).not.toHaveBeenCalled()
  })

  it('with a Modal presented: parks (no details, no snackbar yet), offers once clear', () => {
    const { hook, offers } = setup()
    const modal = renderHook(({ v }) => useModalPresence(v), { initialProps: { v: true } })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    expect(hook.result.current.detailsReq).toBeNull()
    // Still presented a long while later: nothing shown (it would sit under it).
    act(() => vi.advanceTimersByTime(60_000))
    expect(offers).toEqual([])
    // Dismissed: still nothing during the dismiss grace…
    modal.rerender({ v: false })
    act(() => vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS))
    expect(offers).toEqual([])
    // …then the calm offer, low priority (never clobbers a visible Undo).
    settle()
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({
      message: 'Reminder: “Call mom”',
      actionLabel: 'Open',
      durationMs: DETAILS_OFFER_MS,
      queue: true,
    })
    // Open → the details sheet.
    act(() => offers[0].onAction())
    expect(hook.result.current.detailsReq).toEqual({ id: 'a', subtaskId: null })
    settle()
    expect(offers).toHaveLength(1)
    modal.unmount()
  })

  it('a provider sheet open parks too; a newer reminder replaces the parked one', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'reminder' }))
    settle()
    expect(offers).toEqual([])
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers.map((o) => o.message)).toEqual(['Reminder: “Pay rent”'])
  })

  it('opening the parked to-do directly drops the offer', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    act(() => hook.result.current.closeTaskDetails())
    settle()
    expect(offers).toEqual([])
  })

  it('a to-do deleted while parked is never offered', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('gone', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers).toEqual([])
  })

  it('waits for details to close before offering (it renders over the snackbar)', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    // A picker is up inside details → can't swap: park.
    const picker = renderHook(() => useModalPresence(true))
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'reminder' }))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    picker.unmount()
    settle()
    // Details is still open on 'a' — the offer would sit under it.
    expect(offers).toEqual([])
    act(() => hook.result.current.closeTaskDetails())
    settle()
    expect(offers.map((o) => o.message)).toEqual(['Reminder: “Pay rent”'])
  })

  it('swap: closes details through its save path, then opens the new to-do', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    const close = vi.fn(() => hook.result.current.closeTaskDetails())
    act(() => hook.result.current.registerDetailsClose(close))
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'reminder' }))
    expect(close).toHaveBeenCalledTimes(1)
    expect(hook.result.current.detailsReq).toBeNull()
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS))
    expect(hook.result.current.detailsReq?.id).toBe('b')
    settle()
    expect(offers).toEqual([])
  })

  it('swap whose close does not close (series confirm up) parks — nothing stays pending', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.registerDetailsClose(() => {}))
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'reminder' }))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    // The user cancels the confirm, keeps editing, then closes: 'b' must not
    // pop open out of nowhere — it's offered instead.
    act(() => hook.result.current.closeTaskDetails())
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS))
    expect(hook.result.current.detailsReq).toBeNull()
    settle()
    expect(offers.map((o) => o.message)).toEqual(['Reminder: “Pay rent”'])
  })

  it('without a registered close path, a swap just closes and opens the new one', () => {
    const { hook } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.registerDetailsClose(null))
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'reminder' }))
    // setDetailsReq(null) without the onClose path: no queued swap.
    expect(hook.result.current.detailsReq).toBeNull()
  })

  it('a queued swap re-plans after the handoff: a sheet opened meanwhile → parked', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.registerDetailsClose(() => hook.result.current.closeTaskDetails()))
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: true, accountUid: 'u1' })
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS))
    expect(hook.result.current.detailsReq).toBeNull()
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers.map((o) => o.message)).toEqual(['Reminder: “Pay rent”'])
  })

  it('Open while something is still dismissing retries a few handoffs later', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers).toHaveLength(1)
    const modal = renderHook(() => useModalPresence(true))
    act(() => offers[0].onAction())
    expect(hook.result.current.detailsReq).toBeNull()
    modal.unmount()
    act(() => vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS + MODAL_HANDOFF_MS))
    expect(hook.result.current.detailsReq?.id).toBe('a')
  })

  it('Open gives up retrying after a while and parks the request again', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    const modal = renderHook(() => useModalPresence(true))
    act(() => offers[0].onAction())
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS * 10))
    expect(hook.result.current.detailsReq).toBeNull()
    expect(offers).toHaveLength(1)
    modal.unmount()
    settle()
    expect(offers).toHaveLength(2)
  })

  it('uid change clears the open sheet, a queued swap and a parked offer', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.registerDetailsClose(() => hook.result.current.closeTaskDetails()))
    // Swap queued (handoff pending)…
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'reminder' }))
    // …and another one parked behind a modal.
    const modal = renderHook(() => useModalPresence(true))
    act(() => hook.result.current.openTaskDetails('c', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u2' })
    modal.unmount()
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS))
    expect(hook.result.current.detailsReq).toBeNull()
    settle()
    expect(offers).toEqual([])
  })

  it('after a uid change, a later close never reopens the old account\'s to-do', () => {
    const { hook } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.registerDetailsClose(() => {}))
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u2' })
    act(() => hook.result.current.closeTaskDetails())
    settle()
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS))
    expect(hook.result.current.detailsReq).toBeNull()
  })

  it('forgetDetails drops the sheet and a queued swap', () => {
    const { hook } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.forgetDetails())
    expect(hook.result.current.detailsReq).toBeNull()
  })

  it('afterModalClose runs after the handoff; cancelHandoffs drops pending ones', () => {
    const { hook } = setup()
    const fn = vi.fn()
    act(() => hook.result.current.afterModalClose(fn))
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS - 1))
    expect(fn).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(fn).toHaveBeenCalledTimes(1)
    const later = vi.fn()
    act(() => hook.result.current.afterModalClose(later))
    act(() => hook.result.current.cancelHandoffs())
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS))
    expect(later).not.toHaveBeenCalled()
  })

  it('unmount drops pending handoffs', () => {
    const { hook } = setup()
    const fn = vi.fn()
    act(() => hook.result.current.afterModalClose(fn))
    hook.unmount()
    vi.advanceTimersByTime(MODAL_HANDOFF_MS)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('useDetailsRouter — round 5', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetModalPresenceForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('the offer re-checks when it would show: a sheet opened meanwhile → handed back, offered again later', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers).toHaveLength(1)
    expect(offers[0].canShow()).toBe(true)
    // An "Added · Undo" was visible, so the offer waited; Compose opened
    // again before the Undo ended → NotifyProvider asks and is told no.
    hook.rerender({ anySheetOpen: true, accountUid: 'u1' })
    expect(offers[0].canShow()).toBe(false)
    act(() => offers[0].onBlocked())
    settle()
    expect(offers).toHaveLength(1)
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers).toHaveLength(2)
    expect(offers[1].message).toBe('Reminder: “Call mom”')
  })

  it('a reminder for a trashed to-do is never parked or offered', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('t', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers).toEqual([])
  })

  it('a to-do trashed while parked is not offered, and an offer for one can no longer show', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'reminder' }))
    TODOS.b.trashed = true
    try {
      hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
      settle()
      expect(offers).toEqual([])
    } finally {
      delete TODOS.b.trashed
    }
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    // (Nothing presented: 'a' opened directly.)
    expect(hook.result.current.detailsReq?.id).toBe('a')
  })

  it('a parked request expires: no offer hours later, and the poll stops', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => vi.advanceTimersByTime(PARK_TTL_MS + PARK_POLL_MS))
    expect(vi.getTimerCount()).toBe(0)
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers).toEqual([])
  })

  it('a handed-back offer keeps its original expiry', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    hook.rerender({ anySheetOpen: true, accountUid: 'u1' })
    act(() => offers[0].onBlocked())
    act(() => vi.advanceTimersByTime(PARK_TTL_MS))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers).toHaveLength(1)
  })

  it("the user's own row tap is never parked or relabelled — it retries, then opens", () => {
    const { hook, offers } = setup()
    const modal = renderHook(({ v }) => useModalPresence(v), { initialProps: { v: true } })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'user' }))
    expect(hook.result.current.detailsReq).toBeNull()
    modal.rerender({ v: false })
    act(() => vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS + MODAL_HANDOFF_MS))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    settle()
    expect(offers).toEqual([])
    modal.unmount()
  })

  it('a user tap that still can not open after the retries is dropped (no "Reminder" offer)', () => {
    const { hook, offers } = setup()
    const modal = renderHook(() => useModalPresence(true))
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'user' }))
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS * (MAX_OPEN_RETRIES + 2)))
    modal.unmount()
    settle()
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS * 2))
    expect(hook.result.current.detailsReq).toBeNull()
    expect(offers).toEqual([])
  })

  it("details' own dismiss counts as presented: a row tap right after closing waits for it", () => {
    const { hook } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'user' }))
    act(() => hook.result.current.closeTaskDetails())
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'user' }))
    // Not presented over the sheet that's still animating out…
    expect(hook.result.current.detailsReq).toBeNull()
    // …but opened once it has animated out (the next handoff after the grace).
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS))
    expect(hook.result.current.detailsReq).toBeNull()
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS))
    expect(hook.result.current.detailsReq?.id).toBe('b')
  })

  it("a reminder tap during details' dismiss is parked, then offered", () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.closeTaskDetails())
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'reminder' }))
    expect(hook.result.current.detailsReq).toBeNull()
    settle()
    expect(offers.map((o) => o.message)).toEqual(['Reminder: “Pay rent”'])
  })

  it('the offer waits the full dismiss grace after the screen clears (not just one poll)', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    act(() => vi.advanceTimersByTime(2 * PARK_POLL_MS))
    expect(offers).toEqual([])
    act(() => vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS))
    expect(offers).toHaveLength(1)
  })

  it('the clear streak resets when the screen stops being clear', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    act(() => vi.advanceTimersByTime(2 * PARK_POLL_MS))
    hook.rerender({ anySheetOpen: true, accountUid: 'u1' })
    act(() => vi.advanceTimersByTime(PARK_POLL_MS))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    act(() => vi.advanceTimersByTime(PARK_POLL_MS))
    expect(offers).toEqual([])
  })

  it('Open retries exactly MAX_OPEN_RETRIES handoffs, then parks again', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    const modal = renderHook(() => useModalPresence(true))
    act(() => offers[0].onAction())
    act(() => vi.advanceTimersByTime(MAX_OPEN_RETRIES * MODAL_HANDOFF_MS + 1))
    modal.unmount()
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS))
    expect(hook.result.current.detailsReq).toBeNull()
  })

  it('opening ANOTHER to-do keeps the parked offer', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'user' }))
    expect(hook.result.current.detailsReq?.id).toBe('b')
    act(() => hook.result.current.closeTaskDetails())
    settle()
    expect(offers.map((o) => o.message)).toEqual(['Reminder: “Call mom”'])
  })
})

describe('useDetailsRouter — round 6', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetModalPresenceForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a request whose Modal never presented is cleared (not a ghost) — a reminder is offered instead', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    act(() => hook.result.current.detailsMounted())
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS - 1))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    act(() => vi.advanceTimersByTime(1))
    expect(hook.result.current.detailsReq).toBeNull()
    settle()
    expect(offers.map((o) => o.message)).toEqual(['Reminder: “Call mom”'])
    // The ghost no longer blocks a later open.
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'user' }))
    expect(hook.result.current.detailsReq?.id).toBe('b')
  })

  it('a presented sheet (onShow) is kept; a user tap that never presented is just dropped', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.detailsMounted())
    act(() => hook.result.current.detailsShown())
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS * 3))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    act(() => hook.result.current.closeTaskDetails())
    settle()
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'user' }))
    act(() => hook.result.current.detailsMounted())
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS))
    expect(hook.result.current.detailsReq).toBeNull()
    settle()
    expect(offers).toEqual([])
  })

  it('an offer already handed to the snackbar queue is dropped once that to-do was opened directly', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers).toHaveLength(1)
    // It waits behind a visible Undo; meanwhile the user opens 'a' from its row…
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'user' }))
    act(() => hook.result.current.detailsShown())
    // …and closes it. When the Undo ends the screen is clear, but the offer
    // is moot: it can't show, and handing it back doesn't re-park it.
    act(() => hook.result.current.closeTaskDetails())
    settle()
    expect(offers[0].canShow()).toBe(false)
    act(() => offers[0].onBlocked())
    act(() => vi.advanceTimersByTime(PARK_POLL_MS * 20))
    expect(offers).toHaveLength(1)
  })

  it('a handed-back offer carries its expiry: it lapses on the original clock', () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers).toHaveLength(1)
    act(() => vi.advanceTimersByTime(PARK_TTL_MS - 10_000))
    hook.rerender({ anySheetOpen: true, accountUid: 'u1' })
    act(() => offers[0].onBlocked())
    act(() => vi.advanceTimersByTime(15_000))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers).toHaveLength(1)
  })

  it("canShow re-checks the to-do: trashed while queued → can't show, and isn't re-parked", () => {
    const { hook, offers } = setup({ anySheetOpen: true })
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    hook.rerender({ anySheetOpen: false, accountUid: 'u1' })
    settle()
    expect(offers[0].canShow()).toBe(true)
    TODOS.a.trashed = true
    try {
      expect(offers[0].canShow()).toBe(false)
      act(() => offers[0].onBlocked())
      settle()
    } finally {
      delete TODOS.a.trashed
    }
    settle()
    expect(offers).toHaveLength(1)
  })

  it("a user tap whose swap is held by details' close (confirm up) is dropped — never offered", () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.detailsShown())
    act(() => hook.result.current.registerDetailsClose(() => {}))
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'user' }))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    act(() => hook.result.current.closeTaskDetails())
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS))
    expect(hook.result.current.detailsReq).toBeNull()
    settle()
    expect(offers).toEqual([])
  })
})

describe('useDetailsRouter — round 7 (ghost guard timed from mount)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetModalPresenceForTests()
    AppState.currentState = 'active'
    vi.mocked(reportNonFatal).mockClear()
  })
  afterEach(() => {
    AppState.currentState = 'active'
    vi.useRealTimers()
  })

  it('a slow mount does not start the clock: a late onShow after mount keeps the sheet', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    // Cold launch: React takes ages to get the sheet mounted — no clock yet.
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS * 4))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    act(() => hook.result.current.detailsMounted())
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS - 1))
    act(() => hook.result.current.detailsShown())
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS * 4))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    settle()
    expect(offers).toEqual([])
  })

  it('times out while the app is not active → re-arms once instead of clearing', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.detailsMounted())
    AppState.currentState = 'background'
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    // Resumed and presented within the second budget: kept.
    AppState.currentState = 'active'
    act(() => hook.result.current.detailsShown())
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS * 2))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    expect(offers).toEqual([])
  })

  it('re-arms only once: still never presented after the second budget → cleared (and offered)', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.detailsMounted())
    AppState.currentState = 'inactive'
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS))
    expect(hook.result.current.detailsReq?.id).toBe('a')
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS))
    expect(hook.result.current.detailsReq).toBeNull()
    AppState.currentState = 'active'
    settle()
    expect(offers.map((o) => o.message)).toEqual(['Reminder: “Call mom”'])
  })

  it('closeTaskDetails before onShow, then the timeout → no offer, nothing reopened', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.detailsMounted())
    act(() => hook.result.current.closeTaskDetails())
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS * 2))
    expect(hook.result.current.detailsReq).toBeNull()
    settle()
    expect(offers).toEqual([])
  })

  it('forgetDetails before onShow, then the timeout → no offer', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.detailsMounted())
    act(() => hook.result.current.forgetDetails())
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS * 2))
    expect(hook.result.current.detailsReq).toBeNull()
    settle()
    expect(offers).toEqual([])
  })

  it('an account change before onShow, then the timeout → no offer', () => {
    const { hook, offers } = setup()
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'reminder' }))
    act(() => hook.result.current.detailsMounted())
    hook.rerender({ anySheetOpen: false, accountUid: 'u2' })
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS * 2))
    expect(hook.result.current.detailsReq).toBeNull()
    settle()
    expect(offers).toEqual([])
  })

  it('a mount report for a request that already presented (or none) is a no-op', () => {
    const { hook } = setup()
    act(() => hook.result.current.detailsMounted())
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'user' }))
    act(() => hook.result.current.detailsShown())
    act(() => hook.result.current.detailsMounted())
    act(() => vi.advanceTimersByTime(DETAILS_SHOW_TIMEOUT_MS * 2))
    expect(hook.result.current.detailsReq?.id).toBe('a')
  })

  it('a user tap dropped after MAX_OPEN_RETRIES is reported (non-fatal); a reminder park is not', () => {
    const { hook } = setup()
    const modal = renderHook(() => useModalPresence(true))
    act(() => hook.result.current.openTaskDetails('a', null, { source: 'user' }))
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS * (MAX_OPEN_RETRIES + 2)))
    expect(reportNonFatal).toHaveBeenCalledTimes(1)
    act(() => hook.result.current.openTaskDetails('b', null, { source: 'reminder' }))
    act(() => vi.advanceTimersByTime(MODAL_HANDOFF_MS * (MAX_OPEN_RETRIES + 2)))
    expect(reportNonFatal).toHaveBeenCalledTimes(1)
    modal.unmount()
  })
})
