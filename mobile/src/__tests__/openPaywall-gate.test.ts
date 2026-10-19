// @vitest-environment happy-dom
/**
 * openPaywall is gated at the source: with IAP_ENABLED off (the free-only
 * v2.0.0 release) calling it must never show the paywall, whichever screen
 * forgot to check the flag. Native deps (Firestore, RevenueCat, the sheet
 * UI) are mocked; the PaywallSheet mock records its `visible` prop.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import React from 'react'

const { flags, sheetVisible } = vi.hoisted(() => ({
  flags: { IAP_ENABLED: false },
  sheetVisible: [] as boolean[],
}))

vi.mock('../app/featureFlags', () => ({
  get IAP_ENABLED() {
    return flags.IAP_ENABLED
  },
  MOCHI_AGENT_ENABLED: true,
  LANGUAGE_PICKER_ENABLED: false,
}))
vi.mock('@react-native-firebase/firestore', () => ({ doc: vi.fn(), onSnapshot: vi.fn(() => () => {}) }))
vi.mock('../adapters/firebase', () => ({ db: {} }))
vi.mock('../app/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../adapters/purchases', () => ({
  configurePurchases: vi.fn(),
  fetchCurrentOffering: vi.fn(async () => null),
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn(),
  onCustomerInfoChange: vi.fn(() => () => {}),
  currentCustomerInfo: vi.fn(async () => null),
  tierFromCustomerInfo: vi.fn(() => 'free'),
  productFromCustomerInfo: vi.fn(() => null),
  checkTrialEligibility: vi.fn(async () => ({})),
  manageSubscriptions: vi.fn(),
  isPurchasesEnabled: () => false,
}))
vi.mock('../features/membership/PaywallSheet', () => ({
  default: (props: { visible: boolean }) => {
    sheetVisible.push(props.visible)
    return null
  },
}))

import { PurchasesProvider, usePurchases } from '../app/PurchasesContext'

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(PurchasesProvider, null, children)

afterEach(() => {
  sheetVisible.length = 0
  flags.IAP_ENABLED = false
})

describe('openPaywall gate', () => {
  it('is a no-op while IAP_ENABLED is false', () => {
    const { result } = renderHook(() => usePurchases(), { wrapper })
    act(() => result.current.openPaywall('Unlock every theme with Premium.'))
    expect(sheetVisible.length).toBeGreaterThan(0)
    expect(sheetVisible.every((v) => v === false)).toBe(true)
  })

  it('opens the paywall when IAP is on', () => {
    flags.IAP_ENABLED = true
    const { result } = renderHook(() => usePurchases(), { wrapper })
    act(() => result.current.openPaywall('reason'))
    expect(sheetVisible[sheetVisible.length - 1]).toBe(true)
  })
})
