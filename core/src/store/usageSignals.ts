import { StorageAdapter, unwrapEnvelope, wrapEnvelope } from '../ports/persistence'

/**
 * P0 Tier 2 privacy-preserving measurement signals (docs/MEASUREMENT-PLAN.md),
 * kept in their OWN state doc (`users/{uid}/state/signals`), never in the
 * profile. First-party, aggregate-only — read by the metricsRollup Cloud
 * Function as counts; never behavioral tracking.
 *
 * Why a separate doc (QA 2026-10-18 — surfaced by 3 independent passes): when
 * the signals lived on the profile, stamping them at app open rewrote the
 * WHOLE profile doc —
 *  - after a failed / stalled profile hydrate it pushed SEED_PROFILE over the
 *    real cloud profile (defeating useSyncedState's "never write defaults we
 *    failed to read" guard);
 *  - from a stale offline cache it overwrote newer edits made on another device;
 *  - v1.6 clients (which don't know the fields) stripped them on write-back.
 * A dedicated doc touched only by `refreshUsageSignals` has none of those
 * failure modes, and it is skipped entirely when the read fails.
 */

export const USAGE_SIGNALS_KEY = 'signals'

export interface UsageSignals {
  /** First time this account opened the app (ISO timestamp). Set once. */
  createdAt?: string
  /** Last day the app was opened/foregrounded (user-local YYYY-MM-DD). */
  lastActiveDate?: string
  /** First open with a completed to-do (ISO timestamp). Set once. */
  activatedAt?: string
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const ISO_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/

function migrateTimestamp(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length <= 32 && ISO_RE.test(raw) ? raw : undefined
}

function migrateDay(raw: unknown): string | undefined {
  return typeof raw === 'string' && DAY_RE.test(raw) ? raw : undefined
}

/** Defensive parse of the stored doc's `data` — junk fields are dropped. */
export function migrateUsageSignals(raw: unknown): UsageSignals {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const r = raw as Record<string, unknown>
  const createdAt = migrateTimestamp(r.createdAt)
  const lastActiveDate = migrateDay(r.lastActiveDate)
  const activatedAt = migrateTimestamp(r.activatedAt)
  return {
    ...(createdAt ? { createdAt } : {}),
    ...(lastActiveDate ? { lastActiveDate } : {}),
    ...(activatedAt ? { activatedAt } : {}),
  }
}

export interface StampOptions {
  nowISO: string
  today: string
  hasCompletedTodo: boolean
}

/**
 * PURE. createdAt + activatedAt are set once; lastActiveDate moves to today.
 * Returns the SAME reference when nothing changes so the caller can skip the
 * write.
 */
export function stampUsageSignals(signals: UsageSignals, opts: StampOptions): UsageSignals {
  const createdAt = signals.createdAt ?? opts.nowISO
  const activatedAt = signals.activatedAt ?? (opts.hasCompletedTodo ? opts.nowISO : undefined)
  if (
    signals.createdAt === createdAt &&
    signals.activatedAt === activatedAt &&
    signals.lastActiveDate === opts.today
  ) {
    return signals
  }
  return {
    ...signals,
    createdAt,
    lastActiveDate: opts.today,
    ...(activatedAt ? { activatedAt } : {}),
  }
}

export type RefreshResult = 'written' | 'unchanged' | 'skipped'

/**
 * Read → stamp → write-if-changed against the signals doc. If the READ fails
 * (offline with nothing cached, permission, timeout) it writes NOTHING —
 * stamping on top of an unknown state could regress the set-once fields.
 * Never throws: measurement must never break the app.
 */
export async function refreshUsageSignals(
  adapter: Pick<StorageAdapter, 'getItem' | 'setItem'>,
  opts: StampOptions,
): Promise<RefreshResult> {
  let current: UsageSignals
  try {
    const stored = await adapter.getItem(USAGE_SIGNALS_KEY)
    // Unreadable JSON: skip rather than overwrite it with defaults.
    if (stored) JSON.parse(stored)
    current = migrateUsageSignals(unwrapEnvelope(stored))
  } catch {
    return 'skipped'
  }
  const next = stampUsageSignals(current, opts)
  if (next === current) return 'unchanged'
  try {
    await adapter.setItem(USAGE_SIGNALS_KEY, wrapEnvelope(next))
    return 'written'
  } catch {
    return 'skipped'
  }
}
