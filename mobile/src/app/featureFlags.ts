/**
 * App-shell feature flags.
 *
 * MOCHI_AGENT_ENABLED — master kill-switch for the Mochi agent ("Ask
 * Mochi" chat surface). The entry point lives in the compose sheet
 * ("Ask Mochi instead"); the chat sheet itself is hosted in
 * SheetContext. Flip to `false` to fully hide the feature (the compose
 * affordance disappears and the sheet never mounts) without removing the
 * wiring. Mirrors the "Ask Mochi" toggle in Settings.
 */
export const MOCHI_AGENT_ENABLED = true

/**
 * TODOS_PER_DOC_DUAL_WRITE — default-OFF scaffolding for the per-item
 * persistence cutover (docs/SPIKE-persistence-scale.md, option B).
 *
 * When ON, useTodoStore mirrors every todo into a per-item collection
 * (users/{uid}/todos/{id} in cloud, `todos/{id}` in AsyncStorage signed-out)
 * IN ADDITION to the existing single-doc write. Reads stay on the single doc,
 * so this is a non-destructive shadow populate — zero behavior change. The
 * read-cutover + single-doc drop are SEPARATE, later steps gated on on-device
 * QA (multi-device conflict + offline). Do NOT flip this on for production
 * until that QA is done; see the spike's cutover checklist.
 */
export const TODOS_PER_DOC_DUAL_WRITE = false
