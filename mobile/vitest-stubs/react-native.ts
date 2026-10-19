/**
 * Minimal `react-native` stub for mobile hook tests (happy-dom + renderHook).
 *
 * Hooks under test may import an RN primitive (e.g. `AppState` in
 * useSyncedState). RN's Flow-typed source can't be transformed by vitest, so
 * mobile/vitest.config.ts aliases this stub in. The tests cover the hooks'
 * platform-agnostic behavior.
 *
 * `AppState` records its listeners so a test can drive lifecycle changes
 * with `AppState.__emit('background')`.
 */

type AppStateStatus = 'active' | 'background' | 'inactive'
type Handler = (state: AppStateStatus) => void

const handlers = new Set<Handler>()

export const AppState = {
  currentState: 'active' as AppStateStatus,
  addEventListener: (_type: 'change', handler: Handler) => {
    handlers.add(handler)
    return { remove: () => { handlers.delete(handler) } }
  },
  /** Test-only: deliver a lifecycle change to every live listener. */
  __emit(state: AppStateStatus) {
    AppState.currentState = state
    ;[...handlers].forEach((h) => h(state))
  },
  /** Test-only: how many listeners are attached. */
  __listenerCount: () => handlers.size,
}

/** Inert Alert: tests spy on it (vi.spyOn(Alert, 'alert')). */
export const Alert = {
  alert: (..._args: unknown[]) => {},
}
