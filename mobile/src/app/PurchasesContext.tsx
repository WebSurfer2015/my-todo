import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { doc, onSnapshot } from '@react-native-firebase/firestore'
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases'
import { db } from '../adapters/firebase'
import { useAuth } from './AuthContext'
import {
  configurePurchases,
  fetchCurrentOffering,
  purchasePackage as rcPurchase,
  restorePurchases as rcRestore,
  onCustomerInfoChange,
  isPurchasesEnabled,
} from '../adapters/purchases'
import {
  FREE_ENTITLEMENT,
  TIER_LIMITS,
  canSendMochiRequest,
  effectiveTier,
  type Entitlement,
  type Tier,
} from '../core-bindings/entitlements'
import PaywallSheet from '../features/membership/PaywallSheet'

/**
 * Owns the user's effective entitlement (read-only from the webhook-written
 * Firestore doc — the client never writes it), the Mochi usage meter, and
 * the purchase/restore flow. Hosts the paywall sheet so any screen can call
 * `openPaywall(reason)`.
 *
 * Everything degrades to `basic` when RevenueCat isn't configured, so the
 * app behaves exactly as before launch.
 */

interface PurchasesValue {
  tier: Tier
  entitlement: Entitlement
  /** Base allowance left in the current period (the day for Free, the
   * month for paid) — null until the usage doc loads. Beyond this it's
   * pay as you go. */
  mochiRemaining: number | null
  /** Which period `mochiRemaining` counts. */
  mochiPeriod: 'today' | 'month'
  /** Whether one more request is allowed right now (base allowance OR a
   * top-up balance). */
  canSendMochi: boolean
  offering: PurchasesOffering | null
  purchasesEnabled: boolean
  purchase: (pkg: PurchasesPackage) => Promise<boolean>
  restore: () => Promise<void>
  openPaywall: (reason?: string) => void
  closePaywall: () => void
}

const PurchasesCtx = createContext<PurchasesValue | null>(null)

function parseEnvelope<T>(raw: unknown): T | null {
  if (!raw || typeof raw !== 'object') return null
  const val = (raw as { value?: unknown }).value
  if (typeof val !== 'string') return null
  try {
    return ((JSON.parse(val) as { data?: unknown }).data ?? null) as T | null
  } catch {
    return null
  }
}

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [entitlement, setEntitlement] = useState<Entitlement>(FREE_ENTITLEMENT)
  const [monthUsed, setMonthUsed] = useState<number | null>(null)
  const [dayUsed, setDayUsed] = useState<number>(0)
  const [offering, setOffering] = useState<PurchasesOffering | null>(null)
  const [paywall, setPaywall] = useState<{ open: boolean; reason?: string }>({ open: false })

  // Configure RevenueCat + load offerings once we know the user.
  useEffect(() => {
    if (!uid) return
    let alive = true
    void (async () => {
      await configurePurchases(uid)
      const off = await fetchCurrentOffering()
      if (alive) setOffering(off)
    })()
    const unsub = onCustomerInfoChange(() => {
      // A purchase/renewal/restore landed — refresh offerings (entitlement
      // itself flows in via the Firestore listener below once the webhook
      // writes it).
      void fetchCurrentOffering().then((o) => alive && setOffering(o))
    })
    return () => {
      alive = false
      unsub()
    }
  }, [uid])

  // Live-read the webhook-written entitlement doc (authoritative tier).
  useEffect(() => {
    if (!uid) {
      setEntitlement(FREE_ENTITLEMENT)
      return
    }
    const ref = doc(db, `users/${uid}/state/entitlement`)
    return onSnapshot(
      ref,
      (snap) => {
        const data = parseEnvelope<Partial<Entitlement>>(snap.data())
        setEntitlement(
          data
            ? {
                tier:
                  data.tier === 'premium' || data.tier === 'max' ? data.tier : 'free',
                validUntil: typeof data.validUntil === 'string' ? data.validUntil : null,
                topUpBalance:
                  typeof data.topUpBalance === 'number' ? Math.max(0, data.topUpBalance) : 0,
              }
            : FREE_ENTITLEMENT,
        )
      },
      () => setEntitlement(FREE_ENTITLEMENT),
    )
  }, [uid])

  // Live-read the Mochi usage counter for the meter (server-written; absent
  // until enforcement is on, in which case the meter shows the full budget).
  useEffect(() => {
    if (!uid) {
      setMonthUsed(null)
      return
    }
    const ref = doc(db, `users/${uid}/state/mochiUsage`)
    return onSnapshot(
      ref,
      (snap) => {
        const data = parseEnvelope<{
          month?: string
          monthCalls?: number
          date?: string
          dayCalls?: number
        }>(snap.data())
        const now = new Date()
        const month = now.toISOString().slice(0, 7)
        const today = now.toISOString().slice(0, 10)
        setMonthUsed(data && data.month === month ? Math.max(0, data.monthCalls ?? 0) : 0)
        setDayUsed(data && data.date === today ? Math.max(0, data.dayCalls ?? 0) : 0)
      },
      () => {
        setMonthUsed(0)
        setDayUsed(0)
      },
    )
  }, [uid])

  const tier = useMemo(
    () => effectiveTier(entitlement, new Date().toISOString()),
    [entitlement],
  )
  // Period-appropriate base allowance: Free is gated per-day, paid per-month.
  const limits = TIER_LIMITS[tier]
  const mochiPeriod: 'today' | 'month' = tier === 'free' ? 'today' : 'month'
  const mochiRemaining =
    monthUsed == null
      ? null
      : tier === 'free'
        ? Math.max(0, limits.mochiDaily - dayUsed)
        : Math.max(0, limits.mochiMonthly - monthUsed)
  const canSendMochi =
    monthUsed == null
      ? true
      : canSendMochiRequest(tier, { dayUsed, monthUsed }, entitlement.topUpBalance)

  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    const info = await rcPurchase(pkg)
    return info != null
  }, [])

  const restore = useCallback(async () => {
    await rcRestore()
  }, [])

  const openPaywall = useCallback((reason?: string) => setPaywall({ open: true, reason }), [])
  const closePaywall = useCallback(() => setPaywall({ open: false }), [])

  const value = useMemo<PurchasesValue>(
    () => ({
      tier,
      entitlement,
      mochiRemaining,
      mochiPeriod,
      canSendMochi,
      offering,
      purchasesEnabled: isPurchasesEnabled(),
      purchase,
      restore,
      openPaywall,
      closePaywall,
    }),
    [tier, entitlement, mochiRemaining, mochiPeriod, canSendMochi, offering, purchase, restore, openPaywall, closePaywall],
  )

  return (
    <PurchasesCtx.Provider value={value}>
      {children}
      <PaywallSheet
        visible={paywall.open}
        reason={paywall.reason}
        offering={offering}
        currentTier={tier}
        onPurchase={purchase}
        onRestore={restore}
        onClose={closePaywall}
      />
    </PurchasesCtx.Provider>
  )
}

export function usePurchases(): PurchasesValue {
  const ctx = useContext(PurchasesCtx)
  if (!ctx) throw new Error('usePurchases must be used within PurchasesProvider')
  return ctx
}

/** Convenience: the live feature limits for the current tier. */
export function useTierLimits() {
  const { tier } = usePurchases()
  return TIER_LIMITS[tier]
}
