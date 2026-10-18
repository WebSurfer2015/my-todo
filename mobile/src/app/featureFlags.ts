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
 * IAP_ENABLED — in-app purchases (Sagely Premium via RevenueCat). OFF for the
 * free-only v2.0.0 release (owner decision 2026-10-18): Premium returns in 2.1
 * with a real "zoom-out" capability. While off, RevenueCat is never
 * initialized (no purchase data or device identifier leaves the device), every
 * paywall entry point is hidden, and all color themes are free.
 */
export const IAP_ENABLED = false

/**
 * LANGUAGE_PICKER_ENABLED — the 6-language picker. OFF for the English-only
 * v2.0.0 launch (owner decision 2026-10-18): the other five locales still say
 * "overdue/late" where English says "carried over", and several screens are
 * hard-coded English. Their strings stay in core/src/data/i18n.ts; re-enable
 * once they're re-voiced (not machine-translated — POSITIONING.md).
 */
export const LANGUAGE_PICKER_ENABLED = false
