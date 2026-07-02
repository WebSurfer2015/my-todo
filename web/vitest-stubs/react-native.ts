/**
 * Minimal `react-native` stub for web (happy-dom) tests.
 *
 * A few web tests render MOBILE hooks via renderHook to exercise their pure
 * logic (see web/CLAUDE.md — cross-platform hook testing). Those hooks may
 * import a react-native primitive (e.g. `AppState` in useSyncedState). Web
 * has no react-native, and rolldown can't parse RN's Flow-typed source, so
 * this stub is aliased in for tests. The web tests only cover the hooks'
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
