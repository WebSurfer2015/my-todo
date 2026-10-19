/**
 * Scheduled P0 Tier 2 roll-up: once a day, compute aggregate activation /
 * retention counts for YESTERDAY (UTC) and write them to metrics/{day}.
 *
 * Privacy by construction: per-user rows exist only in memory during the run
 * (dates only); the stored doc holds counts and no uids. metrics/* is
 * server-only — firestore.rules' default deny blocks every client read/write.
 *
 * Users are enumerated from Firebase Auth (not the users/ collection), so
 * orphaned data from deleted accounts is never counted. Cost: one Auth page
 * per 1,000 users + two reads (`state/signals`, `state/agentUsage`) per user per day — fine at launch scale;
 * if it grows, mirror the three signals into a queryable field instead.
 *
 * Idempotent: re-running for the same day overwrites the same doc.
 *
 * The same pass is also the DAILY CLEAN-UP of Mochi conversation records
 * (agentUsage `convs`, chatQuota.ts): a record expires 24h after its last
 * use, but reservations only drop expired ones lazily on the user's next
 * Mochi request — so the job removes them for users who don't come back
 * (docs/PRIVACY.md promises this). It reuses the agentUsage snapshot it
 * already read, so it costs one write per user with something expired and no
 * extra reads or index. Each write is conditional on the doc's update time
 * (precondition): if a live reservation/refund wrote it since the read, the
 * write fails and is skipped — never clobbering a live write — and the next
 * run retries (that live write's own transaction already filters expired
 * records on reserve). Re-running is a no-op.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { addDays, rollUpMetrics, toDay, type MochiDay, type RollupUser } from './metricsRollup'
import { chatDaysFromUsage, parseAgentUsage, pruneExpiredConvs } from './chatQuota'

if (admin.apps.length === 0) admin.initializeApp()

// Users per getAll batch (each user contributes 2 doc refs).
export const GET_ALL_CHUNK = 150

/** state/signals doc → the two client-stamped signals (envelope: {value: '{"version","data"}'}). */
function parseSignals(raw: unknown): Pick<RollupUser, 'lastActiveDate' | 'activatedDay'> {
  const val = (raw as { value?: unknown } | null)?.value
  if (typeof val !== 'string') return {}
  try {
    const data = (JSON.parse(val) as { data?: Record<string, unknown> })?.data ?? {}
    return { lastActiveDate: toDay(data.lastActiveDate), activatedDay: toDay(data.activatedAt) }
  } catch {
    return {}
  }
}

/** state/agentUsage doc → the Mochi day stats it still holds (today + prev). */
function parseMochiDays(raw: unknown): MochiDay[] {
  return chatDaysFromUsage(parseAgentUsage(raw)).map((d) => ({
    date: d.date,
    conversations: d.chatConversations,
    turns: d.chatTurns,
    ceilingHit: d.ceilingHit,
  }))
}

/** Conditional writes of pruned agentUsage docs, collected during the scan. */
export interface PruneStats {
  /** Docs that had expired conversation records. */
  candidates: number
  /** Docs actually rewritten (the rest lost a precondition race or failed). */
  pruned: number
}

/**
 * Remove expired conversation records from ONE agentUsage snapshot (see the
 * header). Resolves true when the doc was rewritten; false when nothing had
 * expired. Rejects when the write failed (incl. a lost precondition race).
 */
export async function pruneUsageSnapshot(
  snap: FirebaseFirestore.DocumentSnapshot,
  nowMs: number,
): Promise<boolean> {
  if (!snap.exists) return false
  const next = pruneExpiredConvs(parseAgentUsage(snap.data()), nowMs)
  if (!next) return false
  await snap.ref.update(
    { value: JSON.stringify({ version: 1, data: next }), updatedAt: nowMs },
    // Only if nobody wrote the doc since we read it (no lost update).
    { lastUpdateTime: snap.updateTime },
  )
  return true
}

export async function collectRollupUsers(
  prune: PruneStats = { candidates: 0, pruned: 0 },
  nowMs: number = Date.now(),
): Promise<RollupUser[]> {
  const db = admin.firestore()
  const accounts: { uid: string; signupDay: string }[] = []
  let pageToken: string | undefined
  do {
    const page = await admin.auth().listUsers(1000, pageToken)
    for (const u of page.users) {
      const signupDay = toDay(u.metadata.creationTime)
      if (signupDay) accounts.push({ uid: u.uid, signupDay })
    }
    pageToken = page.pageToken
  } while (pageToken)

  const rows: RollupUser[] = []
  for (let i = 0; i < accounts.length; i += GET_ALL_CHUNK) {
    const chunk = accounts.slice(i, i + GET_ALL_CHUNK)
    // Two docs per user (signals + agentUsage) in one batched getAll, so a
    // chunk is 2 × GET_ALL_CHUNK refs — interleaved [signals, usage, ...].
    const snaps = await db.getAll(
      ...chunk.flatMap((a) => [
        db.doc(`users/${a.uid}/state/signals`),
        db.doc(`users/${a.uid}/state/agentUsage`),
      ]),
    )
    // Daily conversation-record clean-up on the snapshots just read; bounded
    // by the chunk size, and a failure here never fails the roll-up.
    const results = await Promise.allSettled(
      chunk.map((_a, j) => pruneUsageSnapshot(snaps[2 * j + 1], nowMs)),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value) {
          prune.candidates++
          prune.pruned++
        }
      } else {
        prune.candidates++ // lost a race with a live write, or failed: next run retries
      }
    }
    chunk.forEach((a, j) => {
      const signals = snaps[2 * j]
      const usage = snaps[2 * j + 1]
      const mochiDays = usage.exists ? parseMochiDays(usage.data()) : []
      rows.push({
        signupDay: a.signupDay,
        ...(signals.exists ? parseSignals(signals.data()) : {}),
        ...(mochiDays.length ? { mochiDays } : {}),
      })
    })
  }
  return rows
}

export const metricsRollup = onSchedule(
  // Once a day; never needs (or should have) two overlapping runs.
  // timeoutSeconds: sequential listUsers + getAll over every user — give it
  // headroom past the 60s default as the user count grows.
  {
    schedule: '15 6 * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    maxInstances: 1,
    timeoutSeconds: 300,
  },
  async () => {
    const day = addDays(new Date().toISOString().slice(0, 10), -1)
    const prune: PruneStats = { candidates: 0, pruned: 0 }
    const metrics = rollUpMetrics(await collectRollupUsers(prune), day)
    await admin
      .firestore()
      .doc(`metrics/${day}`)
      .set({ ...metrics, computedAt: Date.now(), version: 2 }) // v2: + mochi
    console.log(
      `metricsRollup: wrote metrics/${day} (${metrics.users.total} users); ` +
        `pruned expired conversation records on ${prune.pruned}/${prune.candidates} docs`,
    )
  },
)
