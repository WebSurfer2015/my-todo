// @vitest-environment happy-dom
/**
 * Small pure decision helpers pulled out of RN components / SDK adapters:
 *   - tierFromCustomerInfo / productFromCustomerInfo (RevenueCat → Tier)
 *   - shouldIgnoreToggleTap (TaskItem's double-tap guard)
 *   - planDetailsOpen (details-sheet Modal handoff on a reminder / row tap)
 */
import { describe, it, expect, vi } from 'vitest'
import { tierFromCustomerInfo, productFromCustomerInfo } from '../adapters/purchaseTier'
import { shouldIgnoreToggleTap, UNCOMPLETE_GUARD_MS } from '../features/task/TaskItem/toggleGuard'
import { detailsNotifyMessage, planDetailsOpen } from '../app/detailsOpenPlan'
import { deleteAccountErrorMessage, DELETE_ACCOUNT_FAILED, DELETE_ACCOUNT_OFFLINE } from '../app/accountErrors'
import { __resetModalPresenceForTests, isAnyModalPresented, useModalPresence } from '../app/modalPresence'
import { MODAL_DISMISS_GRACE_MS } from '../app/modalTiming'
import { PRODUCT_IDS } from '../core-bindings/entitlements'
import { planSnackbar } from '../app/notify'
import { absoluteDateLabel } from '../features/task/absoluteDateLabel'

describe('tierFromCustomerInfo', () => {
  it('no info / nothing active → free', () => {
    expect(tierFromCustomerInfo(null)).toBe('free')
    expect(tierFromCustomerInfo({ entitlements: { active: {} }, activeSubscriptions: [] })).toBe('free')
  })

  it('derives premium from the entitlement\'s product, whatever the entitlement is named', () => {
    expect(
      tierFromCustomerInfo({
        entitlements: { active: { 'pro-access': { productIdentifier: PRODUCT_IDS.premiumAnnual } } },
      }),
    ).toBe('premium')
  })

  it('reads raw active subscriptions and strips an Android base-plan suffix', () => {
    expect(
      tierFromCustomerInfo({
        entitlements: { active: {} },
        activeSubscriptions: [`${PRODUCT_IDS.premiumMonthly}:monthly-base`],
      }),
    ).toBe('premium')
  })

  it('falls back to an entitlement literally named "premium"', () => {
    expect(tierFromCustomerInfo({ entitlements: { active: { premium: { productIdentifier: 'legacy.sku' } } } })).toBe(
      'premium',
    )
    expect(tierFromCustomerInfo({ entitlements: { active: { other: { productIdentifier: 'legacy.sku' } } } })).toBe(
      'free',
    )
  })
})

describe('productFromCustomerInfo', () => {
  it('picks the highest-rank product (annual over monthly)', () => {
    expect(
      productFromCustomerInfo({
        entitlements: { active: { premium: { productIdentifier: PRODUCT_IDS.premiumMonthly } } },
        activeSubscriptions: [`${PRODUCT_IDS.premiumAnnual}:p1y`],
      }),
    ).toBe(PRODUCT_IDS.premiumAnnual)
  })

  it('null when on free or unknown products', () => {
    expect(productFromCustomerInfo(null)).toBeNull()
    expect(productFromCustomerInfo({ entitlements: { active: {} }, activeSubscriptions: ['x.y'] })).toBeNull()
  })
})

describe('shouldIgnoreToggleTap', () => {
  const now = 10_000
  it('ignores taps while a completion is held', () => {
    expect(shouldIgnoreToggleTap({ hasPendingCompletion: true, lastCompletedAt: 0, now })).toBe(true)
  })
  it('ignores the second tap of a double-tap, inside the guard window', () => {
    expect(
      shouldIgnoreToggleTap({ hasPendingCompletion: false, lastCompletedAt: now - UNCOMPLETE_GUARD_MS + 1, now }),
    ).toBe(true)
  })
  it('accepts a tap once the window has passed (and with no prior completion)', () => {
    expect(
      shouldIgnoreToggleTap({ hasPendingCompletion: false, lastCompletedAt: now - UNCOMPLETE_GUARD_MS, now }),
    ).toBe(false)
    expect(shouldIgnoreToggleTap({ hasPendingCompletion: false, lastCompletedAt: 0, now })).toBe(false)
  })
})

describe('planDetailsOpen', () => {
  const base = { todoId: 'a', detailsId: null, anySheetOpen: false, anyModalOpen: false }
  it('opens right away when nothing is up', () => {
    expect(planDetailsOpen(base)).toBe('now')
  })
  it('never force-closes a tracked sheet (a Compose draft) — offers a snackbar', () => {
    expect(planDetailsOpen({ ...base, anySheetOpen: true })).toBe('notify')
  })
  it('never presents over an untracked modal (picker, paywall) — offers a snackbar', () => {
    expect(planDetailsOpen({ ...base, anyModalOpen: true })).toBe('notify')
  })
  it('swaps through the open details sheet\'s save path when only details is up', () => {
    expect(planDetailsOpen({ ...base, detailsId: 'b' })).toBe('swap')
  })
  it('does not swap while a modal sits over details (a picker inside it)', () => {
    expect(planDetailsOpen({ ...base, detailsId: 'b', anyModalOpen: true })).toBe('notify')
  })
  it('is a no-op when that to-do is already showing', () => {
    expect(planDetailsOpen({ ...base, detailsId: 'a', anySheetOpen: true })).toBe('already-open')
  })
})

describe('detailsNotifyMessage', () => {
  it('quotes the title and truncates it at ~40 chars', () => {
    expect(detailsNotifyMessage('  Call mom ')).toBe('Reminder: “Call mom”')
    const long = 'x'.repeat(60)
    expect(detailsNotifyMessage(long)).toBe(`Reminder: “${'x'.repeat(39)}…”`)
  })
  it('keeps a 40-char title whole and truncates at 41', () => {
    const forty = 'y'.repeat(40)
    expect(detailsNotifyMessage(forty)).toBe(`Reminder: “${forty}”`)
    expect(detailsNotifyMessage(`${forty}z`)).toBe(`Reminder: “${'y'.repeat(39)}…”`)
  })
})

describe('deleteAccountErrorMessage', () => {
  it('maps network failures to the offline copy', () => {
    expect(deleteAccountErrorMessage({ code: 'auth/network-request-failed' })).toBe(DELETE_ACCOUNT_OFFLINE)
    expect(deleteAccountErrorMessage(new Error('A network error has occurred'))).toBe(DELETE_ACCOUNT_OFFLINE)
    expect(deleteAccountErrorMessage({ code: 'unavailable' })).toBe(DELETE_ACCOUNT_OFFLINE)
    expect(deleteAccountErrorMessage(new Error('The Internet connection appears to be offline.'))).toBe(
      DELETE_ACCOUNT_OFFLINE,
    )
    expect(deleteAccountErrorMessage({ message: 'Service UNAVAILABLE' })).toBe(DELETE_ACCOUNT_OFFLINE)
  })
  it('ignores non-string code / message fields', () => {
    expect(deleteAccountErrorMessage({ code: 42, message: { offline: true } })).toBe(DELETE_ACCOUNT_FAILED)
    expect(deleteAccountErrorMessage({ code: 'auth/internal-error' })).toBe(DELETE_ACCOUNT_FAILED)
  })
  it('never shows a raw error otherwise', () => {
    expect(deleteAccountErrorMessage(new Error('auth/internal-error: boom'))).toBe(DELETE_ACCOUNT_FAILED)
    expect(deleteAccountErrorMessage(null)).toBe(DELETE_ACCOUNT_FAILED)
  })
})

describe('useModalPresence counter', () => {
  it('counts while visible and keeps counting through the dismiss grace', async () => {
    vi.useFakeTimers()
    const { renderHook } = await import('@testing-library/react')
    const hook = renderHook(({ v }) => useModalPresence(v), { initialProps: { v: true } })
    expect(isAnyModalPresented()).toBe(true)
    hook.rerender({ v: false })
    expect(isAnyModalPresented()).toBe(true)
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    expect(isAnyModalPresented()).toBe(false)
    hook.unmount()
    vi.useRealTimers()
  })

  it('counts several Modals and never goes below zero', async () => {
    vi.useFakeTimers()
    __resetModalPresenceForTests()
    const { renderHook } = await import('@testing-library/react')
    const a = renderHook(({ v }) => useModalPresence(v), { initialProps: { v: true } })
    const b = renderHook(({ v }) => useModalPresence(v), { initialProps: { v: true } })
    a.unmount()
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    // b is still up.
    expect(isAnyModalPresented()).toBe(true)
    // A reset mid-grace (tests) must not drive the count negative.
    __resetModalPresenceForTests()
    b.unmount()
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    expect(isAnyModalPresented()).toBe(false)
    const c = renderHook(() => useModalPresence(true))
    expect(isAnyModalPresented()).toBe(true)
    c.unmount()
    vi.advanceTimersByTime(MODAL_DISMISS_GRACE_MS)
    expect(isAnyModalPresented()).toBe(false)
    vi.useRealTimers()
  })

  it('a hidden Modal is never counted', async () => {
    __resetModalPresenceForTests()
    const { renderHook } = await import('@testing-library/react')
    const h = renderHook(() => useModalPresence(false))
    expect(isAnyModalPresented()).toBe(false)
    h.unmount()
  })
})

describe('planSnackbar (notify queue)', () => {
  it('a low-priority snackbar waits behind a normal one (an Undo)', () => {
    expect(planSnackbar({}, null, { message: 'r', queue: true })).toEqual({ action: 'wait' })
  })
  it('shows right away when nothing (or another low-priority one) is up', () => {
    expect(planSnackbar(null, null, { message: 'r', queue: true })).toEqual({ action: 'show', requeue: false })
    expect(planSnackbar({ queue: true }, null, { message: 'r2', queue: true })).toEqual({
      action: 'show',
      requeue: false,
    })
  })
  it('an Undo replacing a visible offer re-queues the offer (unless one already waits)', () => {
    expect(planSnackbar({ queue: true }, null, { message: 'undo' })).toEqual({ action: 'show', requeue: true })
    expect(planSnackbar({ queue: true }, { message: 'w', queue: true }, { message: 'undo' })).toEqual({
      action: 'show',
      requeue: false,
    })
    expect(planSnackbar({}, null, { message: 'undo' })).toEqual({ action: 'show', requeue: false })
  })
})

describe('absoluteDateLabel (locale)', () => {
  it('formats in the given locale', () => {
    const y = new Date().getFullYear()
    expect(absoluteDateLabel(`${y}-05-17`, 'de-DE')).toBe('17. Mai')
    expect(absoluteDateLabel(`${y + 1}-05-17`, 'de-DE')).toBe(`17. Mai ${y + 1}`)
  })
})
