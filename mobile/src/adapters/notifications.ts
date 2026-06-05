import * as Notifications from 'expo-notifications'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { doc, setDoc, deleteDoc } from '@react-native-firebase/firestore'
import { db } from './firebase'
import {
  REMINDER_ID_PREFIX,
  MAX_FIRES_PER_TODO,
  reminderIdFor,
  todoIdFromReminderId,
  fireIndexFromReminderId,
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
 * Remote push foundation (Phase 0): registerForRemotePushAsync grabs an
 * Expo push token for this device and writes it to users/{uid}/devices/{id}.
 * Cloud Functions read those rows to address pushes per-uid. Caller is
 * responsible for the pre-prompt UX and ensurePermission flow.
 */

const NOTIFICATION_ID = 'sagely-daily-checkin'
const DEVICE_ID_KEY = 'sagely-device-id'

// EAS project id, also in app.json > extra.eas.projectId. Hardcoded
// here so push-token acquisition doesn't depend on expo-constants
// (which isn't installed) — the value is already committed to source.
const EAS_PROJECT_ID = 'c564f1cd-f80d-49e5-9520-fc5191f74c09'

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

/**
 * Stable per-install device identifier. Generated once on first access
 * and persisted to AsyncStorage; a reinstall produces a new id (which
 * is the correct behavior — the OS reissues the push token too).
 */
async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const id = Crypto.randomUUID()
  await AsyncStorage.setItem(DEVICE_ID_KEY, id)
  return id
}

/**
 * Acquires an Expo push token for this device and writes it to
 * users/{uid}/devices/{deviceId}. Requires that notification permission
 * has already been granted (caller owns the pre-prompt + ensurePermission
 * flow). Returns the token on success or null when registration can't
 * complete — no permission, simulator without push support, or the
 * Expo Push relay being unreachable.
 *
 * Safe to call repeatedly: overwriting the same doc is a cheap
 * Firestore update and refreshes updatedAt so the server can tell
 * which devices are stale.
 */
export async function registerForRemotePushAsync(uid: string): Promise<string | null> {
  const settings = await Notifications.getPermissionsAsync()
  if (settings.status !== 'granted') return null
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })
    const token = result.data
    const deviceId = await getDeviceId()
    const ref = doc(db, `users/${uid}/devices/${deviceId}`)
    await setDoc(ref, {
      token,
      platform: Platform.OS,
      updatedAt: Date.now(),
    })
    return token
  } catch (err) {
    // Token acquisition fails on the simulator and during Expo Push
    // outages. Swallow so the local-notification path still works;
    // caller can retry on next sign-in.
    console.warn('registerForRemotePushAsync failed', err)
    return null
  }
}

/**
 * Deletes this device's row from users/{uid}/devices on sign-out so
 * server-driven pushes don't land on a device that's now signed in
 * as someone else. The push token itself isn't revoked with Expo —
 * but without the Firestore mapping the server has no way to address it.
 */
export async function unregisterDevice(uid: string): Promise<void> {
  try {
    const deviceId = await getDeviceId()
    const ref = doc(db, `users/${uid}/devices/${deviceId}`)
    await deleteDoc(ref)
  } catch (err) {
    console.warn('unregisterDevice failed', err)
  }
}

// ── Per-todo local reminders ───────────────────────────────────────────────
//
// Each todo carries `reminders[]` — an array of independent
// reminder entries (multi-reminder schema). Legacy single-reminder
// docs that still have the old `reminder` field are normalized via
// `getReminders` in core. Each entry expands to one OR MANY
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

/** Parse an ISO datetime to a Date. Returns null if unparseable or
 * already past — past-dated fires are dropped silently. */
function parseFutureDate(at: string): Date | null {
  const d = new Date(at)
  if (Number.isNaN(d.valueOf())) return null
  if (d.valueOf() <= Date.now() + 500) return null
  return d
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
  reminder?: { at: string; intervalMinutes?: number; until?: string }
  reminders?: Array<{
    id: string
    at: string
    intervalMinutes?: number
    until?: string
  }>
  done: boolean
  trashed: boolean
}

/** Read-time normalization mirrored from core's getReminders so
 * notifications.ts doesn't need to import all of derive. Returns
 * the multi-reminder array, falling back to wrapping a legacy
 * single `reminder` field as a synthesized singleton with a
 * stable `legacy:<at>` id. */
function readReminders(td: TodoForReminder): Array<{
  id: string
  at: string
  intervalMinutes?: number
  until?: string
}> {
  if (td.reminders && td.reminders.length > 0) return td.reminders
  if (td.reminder?.at) {
    return [
      {
        id: `legacy:${td.reminder.at}`,
        at: td.reminder.at,
        ...(td.reminder.intervalMinutes
          ? { intervalMinutes: td.reminder.intervalMinutes }
          : {}),
        ...(td.reminder.until ? { until: td.reminder.until } : {}),
      },
    ]
  }
  return []
}

export async function syncTodoReminders(todos: TodoForReminder[]): Promise<void> {
  const settings = await Notifications.getPermissionsAsync().catch(() => null)
  if (!settings || settings.status !== 'granted') return

  // Desired schedule, keyed by (todoId, reminderId, fireIndex) so the diff can
  // be done in one pass. Walks the multi-reminder array;
  // readReminders folds the legacy single-reminder field in
  // transparently so old docs still schedule.
  const desired = new Map<string, { todoId: string; title: string; at: Date }>()
  for (const td of todos) {
    if (td.trashed || td.done) continue
    const reminders = readReminders(td)
    for (const r of reminders) {
      if (!r.at) continue
      const fires = computeFires(r)
      for (const fire of fires) {
        desired.set(reminderIdFor(td.id, r.id, fire.index), {
          todoId: td.id,
          title: td.text,
          at: fire.at,
        })
      }
    }
  }

  let scheduled: Notifications.NotificationRequest[]
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync()
  } catch {
    // If we can't read the current set, fall back to "schedule
    // everything desired" — the OS dedupes by identifier so it stays
    // correct, just slightly noisier.
    scheduled = []
  }

  const existingByKey = new Map<string, Notifications.NotificationRequest>()
  for (const req of scheduled) {
    if (req.identifier.startsWith(REMINDER_ID_PREFIX)) {
      existingByKey.set(req.identifier, req)
    }
  }

  // Cancel: anything previously scheduled that's no longer desired,
  // or whose target time / title changed.
  const cancels: Promise<void>[] = []
  for (const [key, req] of existingByKey.entries()) {
    const want = desired.get(key)
    const currentDate = (req.trigger as { date?: number | Date } | null)?.date
    const currentMs =
      currentDate instanceof Date ? currentDate.valueOf() : typeof currentDate === 'number' ? currentDate : undefined
    const sameTime =
      want != null && currentMs != null && Math.abs(want.at.valueOf() - currentMs) < 1000
    const sameTitle = want != null && req.content.title === want.title
    if (!want || !sameTime || !sameTitle) {
      cancels.push(Notifications.cancelScheduledNotificationAsync(req.identifier).catch(() => {}))
    }
  }
  await Promise.all(cancels)

  // Schedule: any desired key that didn't exist OR was just
  // canceled. Skip ones already correctly scheduled.
  const schedules: Promise<unknown>[] = []
  for (const [key, spec] of desired.entries()) {
    const existing = existingByKey.get(key)
    const currentDate = (existing?.trigger as { date?: number | Date } | null)?.date
    const currentMs =
      currentDate instanceof Date ? currentDate.valueOf() : typeof currentDate === 'number' ? currentDate : undefined
    const sameTime =
      currentMs != null && Math.abs(spec.at.valueOf() - currentMs) < 1000
    const sameTitle = existing != null && existing.content.title === spec.title
    if (existing && sameTime && sameTitle) continue

    schedules.push(
      Notifications.scheduleNotificationAsync({
        identifier: key,
        content: {
          title: spec.title,
          body: 'Reminder',
          sound: false,
          data: { todoId: spec.todoId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: spec.at,
        },
      }).catch((err: unknown) => console.warn('scheduleTodoReminder failed', err)),
    )
  }
  await Promise.all(schedules)
}

/** Best-effort cancel for every fire scheduled under a single todo
 * id. Useful for paths that delete a todo permanently and want
 * immediate feedback without waiting for the next syncTodoReminders
 * diff. Reads the OS schedule and cancels each `todo:<id>:N`. */
export async function cancelTodoReminder(todoId: string): Promise<void> {
  let scheduled: Notifications.NotificationRequest[]
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync()
  } catch {
    return
  }
  const targets = scheduled.filter(
    (req) => todoIdFromReminderId(req.identifier) === todoId,
  )
  await Promise.all(
    targets.map((req) =>
      Notifications.cancelScheduledNotificationAsync(req.identifier).catch(() => {}),
    ),
  )
  // Silence unused-warning for fireIndex helper — kept exported for
  // future test/debug paths that introspect the schedule.
  void fireIndexFromReminderId
}
