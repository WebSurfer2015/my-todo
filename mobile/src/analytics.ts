/**
 * Thin wrapper around @react-native-firebase/analytics. Single source
 * of truth for the event taxonomy so adding a new event means
 * adding one method here, not free-form logEvent calls scattered
 * across components.
 *
 * Defensive: every call goes through try/catch so a misconfigured
 * Analytics setup (Firebase Console toggle off, native init not
 * complete) can never crash the app. Analytics is a "nice to know",
 * not a load-bearing dependency.
 *
 * Event taxonomy (Sagely baseline, approved 2026-05-27):
 *   - signup_completed              { provider: 'apple' | 'google' | 'email' }
 *   - first_todo_created
 *   - ai_suggestion_applied         { mode: AiMode }
 *   - mochi_chat_opened
 *   - daily_checkin_enabled
 *   - daily_checkin_disabled
 *   - fab_tapped                    { tab: 'dashboard' | 'todos' | 'shopping' }
 *   - empty_state_cta_tapped        { surface: 'todos' | 'shopping-no-store' | 'shopping-no-item' }
 *   - theme_from_avatar_toggled     { value: boolean }
 *
 * Firebase Analytics event names: lowercase + underscores, ≤40 chars,
 * params ≤25 per event. Reserved prefixes (firebase_, google_,
 * ga_) are off-limits.
 */

import analytics from '@react-native-firebase/analytics'

export type AuthProvider = 'apple' | 'google' | 'email'
export type AiMode =
  | 'classify-grocery-dept'
  | 'suggest-todo-fields'
  | 'breakdown-subtasks'
  | 'link-store-to-items'
  | 'recommend-stores'
export type TabName = 'dashboard' | 'todos' | 'shopping'
export type EmptySurface = 'todos' | 'shopping-no-store' | 'shopping-no-item'

async function safeLog(name: string, params?: Record<string, unknown>): Promise<void> {
  try {
    await analytics().logEvent(name, params ?? {})
  } catch (err) {
    // Never surface analytics failures to the user. Crashlytics
    // catches the underlying issue if it's a real misconfiguration.
    console.warn(`[analytics] ${name} failed:`, err)
  }
}

export const Analytics = {
  signupCompleted(provider: AuthProvider): Promise<void> {
    return safeLog('signup_completed', { provider })
  },
  firstTodoCreated(): Promise<void> {
    return safeLog('first_todo_created')
  },
  aiSuggestionApplied(mode: AiMode): Promise<void> {
    return safeLog('ai_suggestion_applied', { mode })
  },
  mochiChatOpened(): Promise<void> {
    return safeLog('mochi_chat_opened')
  },
  dailyCheckinToggled(enabled: boolean): Promise<void> {
    return safeLog(enabled ? 'daily_checkin_enabled' : 'daily_checkin_disabled')
  },
  fabTapped(tab: TabName): Promise<void> {
    return safeLog('fab_tapped', { tab })
  },
  emptyStateCtaTapped(surface: EmptySurface): Promise<void> {
    return safeLog('empty_state_cta_tapped', { surface })
  },
  themeFromAvatarToggled(value: boolean): Promise<void> {
    return safeLog('theme_from_avatar_toggled', { value: String(value) })
  },
  /** Set the signed-in user id for cross-event attribution. Called
   * from AuthContext when auth state resolves. */
  async setUserId(uid: string | null): Promise<void> {
    try {
      await analytics().setUserId(uid)
    } catch (err) {
      console.warn('[analytics] setUserId failed:', err)
    }
  },
}
