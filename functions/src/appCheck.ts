/**
 * Firebase App Check for the paid AI callables (agentChat, aiInfer).
 *
 * App Check attests that a request comes from the genuine Sagely iOS app
 * (App Attest), not a script holding a stolen/created Firebase ID token —
 * the remaining cheap way to spend our Anthropic budget once fair use is in
 * place. Enforcing it before every client sends a token would lock real
 * users out, so it ships OFF and in MEASURE mode:
 *
 *   - APP_CHECK_ENFORCED = false → requests are allowed either way, and each
 *     one logs `{event:'appCheck', fn, status}` (no uid / no PII) so we can
 *     watch the share of requests carrying a valid token.
 *   - APP_CHECK_ENFORCED = true  → onCall's enforceAppCheck rejects any
 *     request without a valid token (UNAUTHENTICATED) before our handler runs.
 *
 * Rollout:
 *   1. Firebase console → App Check → register the iOS app with the App
 *      Attest provider (and a debug provider for dev-client / simulator).
 *   2. Ship a client build that initializes App Check and sends tokens
 *      (@react-native-firebase/app-check) — out of scope for functions/.
 *   3. Deploy with the flag OFF; in Cloud Logging, chart status=valid vs
 *      missing/invalid for fn=agentChat / fn=aiInfer. Wait until ~all
 *      traffic from current app versions is `valid` (older builds age out).
 *   4. Flip APP_CHECK_ENFORCED to true and deploy. Consider
 *      consumeAppCheckToken (replay protection) only if abuse persists — it
 *      costs an extra round-trip per call.
 */

export const APP_CHECK_ENFORCED = false

export type AppCheckStatus = 'valid' | 'invalid' | 'missing'

/** The bits of a CallableRequest this module reads (structural for tests). */
export interface AppCheckRequestLike {
  /** Set by firebase-functions only when the request carried a VALID token. */
  app?: unknown
  rawRequest?: { header?: (name: string) => string | undefined }
}

/** Classify a callable request's App Check token. With enforcement off,
 * firebase-functions still verifies the token and only populates
 * `request.app` when it's valid; a present-but-unverified header is invalid. */
export function appCheckStatus(request: AppCheckRequestLike): AppCheckStatus {
  if (request.app) return 'valid'
  const header = request.rawRequest?.header?.('X-Firebase-AppCheck')
  return header ? 'invalid' : 'missing'
}

/** Structured rollout metric (measure mode only — when enforced, every request
 * that reaches the handler is valid by construction). No uid, no token. */
export function logAppCheck(fn: 'agentChat' | 'aiInfer', request: AppCheckRequestLike): void {
  if (APP_CHECK_ENFORCED) return
  console.log(JSON.stringify({ event: 'appCheck', fn, status: appCheckStatus(request) }))
}
