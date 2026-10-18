/**
 * Product-event seam — currently a NO-OP. No third-party analytics SDK
 * ships in the app: Firebase Analytics was removed 2026-10-17 (it's a
 * behavioral SDK that contradicts docs/PRIVACY.md and the not-surveilled
 * brand — see docs/MEASUREMENT-PLAN.md).
 *
 * The typed call sites are kept so a future first-party, ANONYMOUS
 * aggregate sink (daily counters via a `recordMetric` Cloud Function —
 * docs/REPOSITIONING-ROADMAP.md 0.3) can be wired here in one place.
 * Any sink added here must stay aggregate-only: no user id, no event
 * stream, no third-party SDK. Update PRIVACY.md before shipping one.
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
 */

export type AuthProvider = 'apple' | 'google' | 'email'
export type AiMode =
  | 'classify-grocery-dept'
  | 'suggest-todo-fields'
  | 'breakdown-subtasks'
  | 'link-store-to-items'
  | 'recommend-stores'
export type TabName = 'dashboard' | 'todos' | 'shopping'
export type EmptySurface = 'todos' | 'shopping-no-store' | 'shopping-no-item'

// Intentionally discards the event. Swap for the first-party aggregate
// sink (roadmap 0.3) when/if it exists.
async function record(_name: string, _params?: Record<string, unknown>): Promise<void> {}

export const Analytics = {
  signupCompleted(provider: AuthProvider): Promise<void> {
    return record('signup_completed', { provider })
  },
  firstTodoCreated(): Promise<void> {
    return record('first_todo_created')
  },
  aiSuggestionApplied(mode: AiMode): Promise<void> {
    return record('ai_suggestion_applied', { mode })
  },
  mochiChatOpened(): Promise<void> {
    return record('mochi_chat_opened')
  },
  dailyCheckinToggled(enabled: boolean): Promise<void> {
    return record(enabled ? 'daily_checkin_enabled' : 'daily_checkin_disabled')
  },
  fabTapped(tab: TabName): Promise<void> {
    return record('fab_tapped', { tab })
  },
  emptyStateCtaTapped(surface: EmptySurface): Promise<void> {
    return record('empty_state_cta_tapped', { surface })
  },
}
