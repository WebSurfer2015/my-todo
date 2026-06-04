/**
 * Ports + contracts for the createTodoStore orchestration layer — the
 * "functional core, imperative shell" seam (task #4).
 *
 * Pure cross-slice coordinators live in this folder. The React glue in
 * each platform's useTodoStore supplies the effects (persistence via
 * useSyncedState, reference-stable callbacks, snackbars, animation
 * timing) and applies the state slices the coordinators return. Nothing
 * here may import React, the storage adapter, or read the clock directly
 * — time/id come through StoreDeps so coordinators stay deterministic.
 */
import type { Strings } from '../data/i18n'

/**
 * The injectable port the orchestration layer depends on instead of
 * touching platform globals. Inject a fixed clock / id generator in
 * tests so coordinators are fully deterministic.
 */
export interface StoreDeps {
  /** Current epoch ms. */
  now: () => number
  /** A fresh globally-unique id (UUID v4 in production). */
  genId: () => string
  /** Resolved i18n table for any user-facing copy a coordinator needs. */
  t: Strings
}
