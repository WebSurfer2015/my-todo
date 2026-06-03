/**
 * createTodoStore — the orchestration factory (task #4, phase 4c).
 *
 * Returns the store's framework-free surface: a flat `actions` table of
 * every pure state transform + coordinator, and `derive(input)` for the
 * platform-agnostic derived state. There is intentionally NO React,
 * adapter, or clock here.
 *
 * Design notes (why this shape, not a stateful container):
 *
 * - `actions` are PURE transforms `(state, …args) => state`, NOT closures
 *   bound to current state. That's deliberate: each platform's
 *   useTodoStore wraps them in reference-stable `useCallback`s with
 *   functional `setState`, preserving the TaskItem/React.memo perf
 *   contract. A factory that returned state-bound closures would hand
 *   back fresh identities every render and break that contract.
 *
 * - `actions` is assembled by spreading the core transform modules, so it
 *   stays in sync automatically as new helpers land (no hand-maintained
 *   registry to drift).
 *
 * - `derive` covers only the platform-agnostic, NON-localized derivation
 *   (deriveState). Localized presentation derived (greeting/mascot/
 *   identity lines) stays in each platform's shell — moving it here would
 *   pull in the deferred i18n work.
 *
 * The persisted state itself (todos, categories, profile, groceries, …)
 * remains owned by the React shell via useSyncedState; this factory
 * operates on whatever state the shell passes into `derive` / the action
 * transforms.
 */
import * as derive from '../derive'
import * as groceries from '../groceries'
import * as filters from '../filters'
import * as statuses from '../statuses'
import * as priorities from '../priorities'
import * as selection from '../selection'
import * as coordinators from './coordinators'
import { deriveState, type DeriveInput, type DerivedState } from '../derive'
import type { StoreDeps } from './types'

/** The full pure-transform surface: every core mutation helper plus the
 * cross-slice coordinators, in one flat namespace. */
export type TodoStoreActions = typeof derive &
  typeof groceries &
  typeof filters &
  typeof statuses &
  typeof priorities &
  typeof selection &
  typeof coordinators

export interface TodoStore {
  /** The injected port (clock / id / i18n) for future deps-needing actions. */
  deps: StoreDeps
  /** Flat table of pure state transforms + coordinators. */
  actions: TodoStoreActions
  /** Platform-agnostic derived state (filtered/grouped/counts/etc.). */
  derive: (input: DeriveInput) => DerivedState
}

/**
 * Build the store's framework-free orchestration surface. Call once per
 * adapter/deps identity in the platform shell (e.g. memoized on `deps`),
 * then drive `actions` through `setState` and feed live state to `derive`.
 */
export function createTodoStore(deps: StoreDeps): TodoStore {
  const actions = {
    ...derive,
    ...groceries,
    ...filters,
    ...statuses,
    ...priorities,
    ...selection,
    ...coordinators,
  } as TodoStoreActions
  return {
    deps,
    actions,
    derive: (input: DeriveInput) => deriveState(input),
  }
}
