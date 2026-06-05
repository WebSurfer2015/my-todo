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
