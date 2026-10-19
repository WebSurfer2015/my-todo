import * as Notifications from 'expo-notifications'
import { nudgeAtFor } from '../../../core/src/logic/reminderPresets'
import {
  REMINDER_ID_PREFIX,
  MAX_FIRES_PER_TODO,
  reminderIdFor,
} from './reminderId'

/**
 * Daily check-in notifications — single repeating local notification at the
 * user-picked hour. Calm-by-design:
 *   - Title is a quiet "Quiet check-in" (no alerts, no exclamation marks)
 *   - Body is mascot-voiced and time-of-day aware (morning/afternoon/evening)
 *   - Sound off (calm-default brand contract)
 *   - One persistent identifier so re-scheduling cleanly replaces the old one
 *     instead of stacking duplicates
 *
 * All notifications are LOCAL (scheduled on-device). There is no server push:
 * no push token is requested or stored.
 */

const NOTIFICATION_ID = 'sagely-daily-checkin'

// Configure the foreground-notification handler at module load. Without
// this, a push arriving while the app is open is silently dropped on
// iOS. Banner + list only — sound and badge stay off to match the
// calm-default brand contract (matches scheduleDailyCheckin below).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

interface CheckinCopy {
  title: string
  body: string
}

function copyForHour(hour: number): CheckinCopy {
  if (hour < 12) {
    return {
      title: 'Quiet check-in',
      body: "Mochi's here. Whenever you're ready.",
    }
  }
  if (hour < 18) {
    return {
      title: 'Quiet check-in',
      body: "Mochi's pacing through the day. No rush.",
    }
  }
  return {
    title: 'Quiet check-in',
    body: "Mochi's settling in. Anything to add for tomorrow?",
  }
}

/** Returns true when the user granted (or already had) permission. */
export async function ensurePermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync()
  if (settings.status === 'granted') return true
  if (settings.status === 'denied' && !settings.canAskAgain) return false
  const req = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: false,
    },
  })
  return req.status === 'granted'
}

export async function scheduleDailyCheckin(hour: number): Promise<boolean> {
  const granted = await ensurePermission()
  if (!granted) return false
  // Cancel any existing scheduled instance under our id, then schedule fresh.
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {})
  const copy = copyForHour(hour)
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: copy.title,
      body: copy.body,
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
    },
  })
  return true
}

export async function cancelDailyCheckin(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {})
}

// ── Per-todo local reminders ───────────────────────────────────────────────
//
// Each todo carries `reminders[]` — an array of independent
// reminder entries. Each entry expands to one OR MANY
// scheduled OS notifications. One-shot reminders schedule a single
// fire. Recurring reminders schedule fires from `at`, stepping by
// `intervalMinutes`, up to `until` (inclusive), capped at
// MAX_FIRES_PER_TODO PER ENTRY so a single todo can't exhaust
// iOS's ~64-notification global budget.
//
// Identifier scheme: `todo:<todoId>:<reminderId>:<fireIndex>`. Each
// fire cancels independently, so reshape/edit needs only to cancel
// the indices that no longer match and schedule any new ones. The
// per-entry `reminderId` keeps two reminders on the same todo from
// colliding under the same fire index.
//
// `syncTodoReminders` is the entry point. Safe to call as often as
// the todo list changes — only deltas hit the native bridge.

interface ScheduledFire {
  index: number
  at: Date
}

/** Compute the fire schedule for one reminder. One-shot → [at] when
 * at is in the future. Recurring → fires at `at + k * interval` for
 * k = 0,1,2,... while ≤ until and k < MAX_FIRES_PER_TODO. Past-dated
 * fires are skipped (so a recurring reminder set hours ago still
 * fires its remaining future occurrences instead of nothing). */
function computeFires(reminder: { at: string; intervalMinutes?: number; until?: string }): ScheduledFire[] {
  const first = new Date(reminder.at)
  if (Number.isNaN(first.valueOf())) return []
  const now = Date.now()
  if (!reminder.intervalMinutes) {
    return first.valueOf() > now + 500 ? [{ index: 0, at: first }] : []
  }
  const stepMs = reminder.intervalMinutes * 60_000
  const until = reminder.until ? new Date(reminder.until) : null
  const untilMs = until && !Number.isNaN(until.valueOf()) ? until.valueOf() : Infinity
  const fires: ScheduledFire[] = []
  for (let k = 0; k < MAX_FIRES_PER_TODO; k++) {
    const at = new Date(first.valueOf() + k * stepMs)
    if (at.valueOf() > untilMs) break
    if (at.valueOf() > now + 500) fires.push({ index: k, at })
  }
  return fires
}

interface TodoForReminder {
  id: string
  text: string
  reminders?: Array<{
    id: string
    at: string
    intervalMinutes?: number
    until?: string
  }>
  done: boolean
  trashed: boolean
}

// Not "gentle nudge" — that's the name of the separate follow-up setting.
const REMINDER_BODY = "Here when you're ready."
// Promise only what a tap does (it opens the app — no actions/deep link yet).
const NUDGE_BODY = "No rush. It'll be here when you're ready."

/** iOS keeps at most 64 pending local notifications per app and silently
 * drops the rest — schedule only the soonest ones, leaving a little headroom. */
const MAX_PENDING = 60

/** The fire time we scheduled, read back from the request's own data. The
 * trigger can't be trusted for this: iOS returns a DATE trigger as a
 * time-interval trigger with no `date`, so comparing triggers never matched
 * and every sync cancelled + re-created every reminder. */
function scheduledAtMs(req: Notifications.NotificationRequest): number | undefined {
  const at = (req.content.data as { atMs?: unknown } | null | undefined)?.atMs
  return typeof at === 'number' ? at : undefined
}

// One sync at a time; a call made while one runs just marks "run again".
let syncInFlight: Promise<void> | null = null
let pendingArgs: [TodoForReminder[], { gentleNudge?: boolean }] | null = null

/**
 * @param opts.gentleNudge — also schedule ONE follow-up per to-do at 9:00 the
 *   morning after its last one-shot reminder (core nudgeAtFor). Done/trashed
 *   to-dos drop out of `desired`, so their nudge is cancelled like any fire.
 *
 * Serialized: overlapping runs could interleave cancel/schedule and leave a
 * stale time behind; the latest call always wins.
 */
export function syncTodoReminders(
  todos: TodoForReminder[],
  opts: { gentleNudge?: boolean } = {},
): Promise<void> {
  pendingArgs = [todos, opts]
  if (!syncInFlight) {
    syncInFlight = (async () => {
      while (pendingArgs) {
        const [t, o] = pendingArgs
        pendingArgs = null
        try {
          await syncOnce(t, o)
        } catch (err) {
          console.warn('syncTodoReminders failed', err)
        }
      }
      syncInFlight = null
    })()
  }
  return syncInFlight
}

async function syncOnce(
  todos: TodoForReminder[],
  opts: { gentleNudge?: boolean },
): Promise<void> {
  const settings = await Notifications.getPermissionsAsync().catch(() => null)
  if (!settings || settings.status !== 'granted') return

  // Desired schedule, keyed by (todoId, reminderId, fireIndex). Two reminders
  // at the same instant on one to-do collapse to one notification.
  type Spec = { todoId: string; title: string; body: string; at: Date }
  const all: Array<[string, Spec]> = []
  for (const td of todos) {
    if (td.trashed || td.done) continue
    const seen = new Set<number>()
    for (const r of td.reminders ?? []) {
      if (!r.at) continue
      for (const fire of computeFires(r)) {
        const ms = fire.at.valueOf()
        if (seen.has(ms)) continue
        seen.add(ms)
        all.push([reminderIdFor(td.id, r.id, fire.index), {
          todoId: td.id,
          title: td.text,
          body: REMINDER_BODY,
          at: fire.at,
        }])
      }
    }
    const nudgeAt = opts.gentleNudge ? nudgeAtFor(td.reminders) : null
    if (nudgeAt) {
      all.push([reminderIdFor(td.id, 'nudge', 0), {
        todoId: td.id,
        title: `Still on your list: ${td.text}`,
        body: NUDGE_BODY,
        at: new Date(nudgeAt),
      }])
    }
  }
  all.sort((a, b) => a[1].at.valueOf() - b[1].at.valueOf())
  const desired = new Map(all.slice(0, MAX_PENDING))

  let scheduled: Notifications.NotificationRequest[]
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync()
  } catch {
    // Can't read the current set: schedule everything desired — the OS
    // replaces by identifier, so it stays correct, just noisier.
    scheduled = []
  }

  const existingByKey = new Map<string, Notifications.NotificationRequest>()
  for (const req of scheduled) {
    if (req.identifier.startsWith(REMINDER_ID_PREFIX)) existingByKey.set(req.identifier, req)
  }

  const isCurrent = (req: Notifications.NotificationRequest | undefined, spec: Spec | undefined) =>
    !!req && !!spec && scheduledAtMs(req) === spec.at.valueOf() &&
    req.content.title === spec.title && req.content.body === spec.body

  await Promise.all(
    [...existingByKey.entries()]
      .filter(([key, req]) => !isCurrent(req, desired.get(key)))
      .map(([key]) => Notifications.cancelScheduledNotificationAsync(key).catch(() => {})),
  )

  await Promise.all(
    [...desired.entries()]
      .filter(([key, spec]) => !isCurrent(existingByKey.get(key), spec))
      .map(([key, spec]) =>
        Notifications.scheduleNotificationAsync({
          identifier: key,
          content: {
            title: spec.title,
            // Calm, never a command (no "!" — brand voice). English-only launch.
            body: spec.body,
            sound: false,
            data: { todoId: spec.todoId, atMs: spec.at.valueOf() },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: spec.at,
          },
        }).catch((err: unknown) => console.warn('scheduleTodoReminder failed', err)),
      ),
  )
}
