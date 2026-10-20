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

/** Inert ActionSheetIOS: tests spy on it. */
export const ActionSheetIOS = {
  showActionSheetWithOptions: (_options: unknown, _callback: (buttonIndex: number) => void) => {},
}

/** Platform: tests run as iOS (the shipped platform); a test may flip `OS`. */
export const Platform = {
  OS: 'ios' as 'ios' | 'android',
}

/** Identity StyleSheet: lets a test read a `makeStyles(theme)` table (e.g.
 * the contrast test checks the row category-label ink). */
export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
  absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const,
  hairlineWidth: 1,
}
