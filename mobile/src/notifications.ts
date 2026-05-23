import * as Notifications from 'expo-notifications'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { doc, setDoc, deleteDoc } from '@react-native-firebase/firestore'
import { db } from './firebase'

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
