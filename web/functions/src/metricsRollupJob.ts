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
 * per 1,000 users + one profile read per user per day — fine at launch scale;
 * if it grows, mirror the three signals into a queryable field instead.
 *
 * Idempotent: re-running for the same day overwrites the same doc.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { addDays, rollUpMetrics, toDay, type RollupUser } from './metricsRollup'

if (admin.apps.length === 0) admin.initializeApp()

const GET_ALL_CHUNK = 300

/** Profile doc → the two profile-side signals (envelope: {value: '{"version","data"}'}). */
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
    const snaps = await db.getAll(...chunk.map((a) => db.doc(`users/${a.uid}/state/profile`)))
    snaps.forEach((snap, j) => {
      rows.push({
        signupDay: chunk[j].signupDay,
        ...(snap.exists ? parseSignals(snap.data()) : {}),
      })
    })
  }
  return rows
}

export const metricsRollup = onSchedule(
  { schedule: '15 6 * * *', timeZone: 'Etc/UTC', region: 'us-central1' },
  async () => {
    const day = addDays(new Date().toISOString().slice(0, 10), -1)
    const metrics = rollUpMetrics(await collectRollupUsers(), day)
    await admin
      .firestore()
      .doc(`metrics/${day}`)
      .set({ ...metrics, computedAt: Date.now(), version: 1 })
    console.log(`metricsRollup: wrote metrics/${day} (${metrics.users.total} users)`)
  },
)
