/**
 * Platform-pure Firebase auth-code → friendly-message map plus the
 * `auth/`-prefix lookup, used by mobile's authErrors adapter. No
 * React/RN/platform imports — the native Apple/Google SDK error maps stay
 * platform-side because their code shapes are SDK-specific.
 *
 * User-facing copy is calm and jargon-free: no client IDs, Service IDs,
 * "handshakes" or "builds". The technical reading of a failure lives in
 * AUTH_DIAGNOSTICS / authErrorDiagnostic — for the crash log only:
 *   - auth/invalid-api-key, auth/app-not-authorized: the bundled
 *     GoogleService-Info.plist or google-services.json is stale; the app
 *     needs a rebuild with fresh config. See docs/AUTH-RECOVERY.md.
 *   - auth/operation-not-allowed: the provider (apple.com / google.com)
 *     is disabled in Firebase Console.
 *   - auth/internal-error: usually a credential/audience mismatch (Google:
 *     the OAuth web client ID; Apple: the Service ID / Sign-in-with-Apple key
 *     in Firebase Console).
 *   - auth/network-request-failed: device offline or Firebase unreachable.
 */

export type AuthFlow = "apple" | "google" | "email";

/** Calm copy for a sign-in failure with no curated message. */
export const AUTH_FALLBACK_MESSAGE = "Couldn't sign you in just now. Please try again.";

/** Calm copy when a provider's sign-in failed for a reason the user can't
 * fix (configuration drift, an SDK hiccup) — try again or another option. */
export function providerFailedMessage(flow: AuthFlow | undefined): string {
  if (flow === "apple") return "Couldn't sign in with Apple just now. Please try again, or use another option.";
  if (flow === "google") return "Couldn't sign in with Google just now. Please try again, or use another option.";
  return "Couldn't sign you in just now. Please try again, or use another option.";
}

/** This version of the app can't sign in at all (stale config) — the one
 * thing that helps is an update. */
const UPDATE_APP_MESSAGE = "Sign-in isn't working in this version of Sagely. Please update the app and try again.";

export const FIREBASE_AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-api-key": UPDATE_APP_MESSAGE,
  "auth/app-not-authorized": UPDATE_APP_MESSAGE,
  "auth/operation-not-allowed":
    "This sign-in option isn't available right now. Please use another option.",
  "auth/network-request-failed":
    "Can't reach the sign-in server. Check your connection and try again.",
  // Flow-specific copy below (providerFailedMessage) — this is the generic.
  "auth/internal-error": providerFailedMessage(undefined),
  "auth/account-exists-with-different-credential":
    "An account with this email already exists. Sign in with the original method.",
  "auth/email-already-in-use":
    "An account with this email already exists.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/invalid-credential": "That email or password isn't right.",
  "auth/invalid-login-credentials": "That email or password isn't right.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/user-not-found": "No account found for that email.",
  "auth/wrong-password": "That email or password isn't right.",
  "auth/weak-password": "Password is too weak — pick something longer.",
  "auth/missing-password": "Enter your password.",
  "auth/missing-email": "Enter your email.",
  "auth/too-many-requests":
    "Too many attempts. Wait a few minutes and try again.",
  "auth/requires-recent-login":
    "Please sign out and sign back in, then try again.",
  "auth/missing-or-invalid-nonce": providerFailedMessage("apple"),
  "auth/popup-blocked": "Sign-in popup was blocked.",
  "auth/cancelled-popup-request": "",
  "auth/popup-closed-by-user": "",
};

/**
 * What a code most likely means, for the crash log ONLY (never shown).
 * Keyed by code; `auth/internal-error` also by `<code>:<flow>`.
 */
export const AUTH_DIAGNOSTICS: Record<string, string> = {
  "auth/invalid-api-key": "stale Firebase config bundled (GoogleService-Info.plist) — rebuild with fresh config",
  "auth/app-not-authorized": "bundle not authorized for this Firebase project — rebuild with fresh config",
  "auth/operation-not-allowed": "provider disabled in Firebase Console",
  "auth/internal-error": "Firebase internal error — usually a credential/audience mismatch",
  "auth/internal-error:google": "OAuth web client ID in this build doesn't match what Firebase expects",
  "auth/internal-error:apple": "Apple Service ID or Sign-in-with-Apple key in Firebase Console out of sync",
  "auth/missing-or-invalid-nonce": "Apple nonce mismatch (raw vs SHA-256 hashed)",
};

/**
 * The raw SDK error code (e.g. "auth/invalid-credential") for crash / log
 * reporting ONLY — never put it in user-facing text. "" when absent.
 */
export function authErrorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const code = (err as { code?: unknown }).code;
  return code == null ? "" : String(code);
}

/**
 * One line for the crash log: the code, the flow, and what it most likely
 * means (AUTH_DIAGNOSTICS) — e.g. "auth/internal-error (google): OAuth web
 * client ID … ". Never user-facing. "(no code)" when the error has none.
 */
export function authErrorDiagnostic(err: unknown, flow?: AuthFlow, extra?: Record<string, string>): string {
  const code = authErrorCode(err);
  const table = { ...AUTH_DIAGNOSTICS, ...(extra ?? {}) };
  const hint = (flow && table[`${code}:${flow}`]) || table[code];
  const head = `${code || "(no code)"}${flow ? ` (${flow})` : ""}`;
  return hint ? `${head}: ${hint}` : head;
}

/** `msg` with the "[auth/…]" / "(auth/…)" code tokens Firebase puts in its
 * raw messages removed — a code is diagnostics, not copy. */
export function stripAuthCode(msg: string): string {
  return msg
    .replace(/[[(]auth\/[\w-]+[\])]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map a Firebase `auth/*` code to a friendly message — never with the code
 * in it (log it via authErrorDiagnostic). The caller is expected to have
 * checked `code.startsWith("auth/")`. `flow` picks the provider's calm copy
 * for auth/internal-error; a code mapped to "" (a cancelled popup) passes
 * `rawMessage` through, code-stripped; an unmapped code gets
 * AUTH_FALLBACK_MESSAGE.
 */
export function mapFirebaseAuthError(
  code: string,
  flow: AuthFlow | undefined,
  rawMessage: string,
): string {
  if (code === "auth/internal-error") return providerFailedMessage(flow);
  const mapped = FIREBASE_AUTH_MESSAGES[code];
  if (mapped !== undefined) return mapped || stripAuthCode(rawMessage);
  return AUTH_FALLBACK_MESSAGE;
}
