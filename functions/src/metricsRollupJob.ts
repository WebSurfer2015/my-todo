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
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { addDays, rollUpMetrics, toDay, type MochiDay, type RollupUser } from './metricsRollup'
import { chatDaysFromUsage, parseAgentUsage } from './chatQuota'

if (admin.apps.length === 0) admin.initializeApp()

// Users per getAll batch (each user contributes 2 doc refs).
const GET_ALL_CHUNK = 150

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

export async function collectRollupUsers(): Promise<RollupUser[]> {
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
    const metrics = rollUpMetrics(await collectRollupUsers(), day)
    await admin
      .firestore()
      .doc(`metrics/${day}`)
      .set({ ...metrics, computedAt: Date.now(), version: 2 }) // v2: + mochi
    console.log(`metricsRollup: wrote metrics/${day} (${metrics.users.total} users)`)
  },
)
