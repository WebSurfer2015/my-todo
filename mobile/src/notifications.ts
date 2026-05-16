import * as Notifications from 'expo-notifications'

/**
 * Daily check-in notifications — single repeating local notification at the
 * user-picked hour. Calm-by-design:
 *   - Title is a quiet "Quiet check-in" (no alerts, no exclamation marks)
 *   - Body is mascot-voiced and time-of-day aware (morning/afternoon/evening)
 *   - Sound off (calm-default brand contract)
 *   - One persistent identifier so re-scheduling cleanly replaces the old one
 *     instead of stacking duplicates
 */

const NOTIFICATION_ID = 'sagely-daily-checkin'

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
