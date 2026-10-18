/**
 * Minimal `react-native` stub for mobile hook tests (happy-dom + renderHook).
 *
 * Hooks under test may import an RN primitive (e.g. `AppState` in
 * useSyncedState). RN's Flow-typed source can't be transformed by vitest, so
 * mobile/vitest.config.ts aliases this stub in. The tests cover the hooks'
 * platform-agnostic behavior, so these are inert no-ops.
 */

type AppStateStatus = 'active' | 'background' | 'inactive'

export const AppState = {
  currentState: 'active' as AppStateStatus,
  addEventListener: (
    _type: 'change',
    _handler: (state: AppStateStatus) => void,
  ) => ({ remove: () => {} }),
}
