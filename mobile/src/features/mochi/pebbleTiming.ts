/**
 * Pebble-flight timing — shared by the animation (PebbleFlight) and the
 * store (useTodosSlice defers applyPebbleDelta so the real pebble lands
 * on the cairn at the exact moment Mochi arrives).
 *
 * These live in a neutral, dependency-free module ON PURPOSE: the store
 * needs PEBBLE_DEFERRAL_MS, but importing it from the PebbleFlight
 * *component* created a cycle
 *   useTodosSlice -> PebbleFlight -> StoreContext -> useTodoStore -> useTodosSlice
 * PebbleFlight now imports these from here instead.
 */
export const FLIGHT_MS = 1800
/** Fraction of FLIGHT_MS at which Mochi reaches the avatar (chime fires). */
export const ARRIVAL_AT = 0.75
export const DROP_MS = FLIGHT_MS * ARRIVAL_AT

/**
 * Time (ms) between a completion gesture and Mochi reaching the cairn to
 * drop the pebble. The store defers `applyPebbleDelta` by this so the
 * real pebble materializes at the moment Mochi lands. Single source for
 * both the animation timing and the data-update timing.
 */
export const PEBBLE_DEFERRAL_MS = DROP_MS
