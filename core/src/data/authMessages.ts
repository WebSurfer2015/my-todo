/**
 * Platform-pure Firebase auth-code → friendly-message map plus the
 * `auth/`-prefix lookup. Shared by mobile's authErrors adapter (and any
 * future web equivalent). No React/RN/platform imports — the native
 * Apple/Google SDK error maps stay platform-side because their code
 * shapes are SDK-specific.
 *
 * Codes worth flagging specifically:
 *   - auth/invalid-api-key, auth/app-not-authorized: the bundled
 *     GoogleService-Info.plist or google-services.json is stale; the app
 *     needs a rebuild with fresh config. See docs/AUTH-RECOVERY.md.
 *   - auth/operation-not-allowed: the provider (apple.com / google.com)
 *     is disabled in Firebase Console.
 *   - auth/network-request-failed: device offline or Firebase unreachable.
 */

export type AuthFlow = "apple" | "google" | "email";

export const FIREBASE_AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-api-key":
    "Sign-in is misconfigured for this build. The app needs to be updated.",
  "auth/app-not-authorized":
    "This build is not authorized for sign-in. The app needs to be updated.",
  "auth/operation-not-allowed":
    "This sign-in method is currently disabled. Try a different option.",
  "auth/network-request-failed":
    "Can't reach the sign-in server. Check your connection and try again.",
  // auth/internal-error gets a flow-specific override below — Firebase's
  // generic catch-all for this code is usually a credential/audience
  // mismatch and the fix differs per provider.
  "auth/internal-error": "Sign-in handshake failed.",
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
  "auth/too-many-requests":
    "Too many attempts. Wait a few minutes and try again.",
  "auth/requires-recent-login":
    "Please sign out and sign back in, then try again.",
  "auth/missing-or-invalid-nonce":
    "Apple sign-in handshake failed. Try again.",
  "auth/popup-blocked": "Sign-in popup was blocked.",
  "auth/cancelled-popup-request": "",
  "auth/popup-closed-by-user": "",
};

/** Calm copy for a sign-in failure with no curated message. */
export const AUTH_FALLBACK_MESSAGE = "Couldn't sign you in just now. Please try again.";

/**
 * The raw SDK error code (e.g. "auth/invalid-credential") for crash / log
 * reporting ONLY — never put it in user-facing text. "" when absent.
 */
export function authErrorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const code = (err as { code?: unknown }).code;
  return code == null ? "" : String(code);
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
 * in it (log it via authErrorCode). The caller is expected to have checked
 * `code.startsWith("auth/")`. `flow` drives the auth/internal-error
 * override; a code mapped to "" (a cancelled popup) passes `rawMessage`
 * through, code-stripped; an unmapped code gets AUTH_FALLBACK_MESSAGE.
 */
export function mapFirebaseAuthError(
  code: string,
  flow: AuthFlow | undefined,
  rawMessage: string,
): string {
  // auth/internal-error needs flow-specific guidance — Firebase's
  // catch-all is almost always a configuration drift in Firebase Console.
  if (code === "auth/internal-error") {
    if (flow === "google") {
      return "Google sign-in handshake failed. The OAuth web client ID in this build doesn't match what Firebase expects. The app needs to be updated.";
    }
    if (flow === "apple") {
      return "Apple sign-in handshake failed. The Apple Service ID or Sign-in-with-Apple key in Firebase Console may be out of sync. The app needs to be updated.";
    }
  }
  const mapped = FIREBASE_AUTH_MESSAGES[code];
  if (mapped !== undefined) return mapped || stripAuthCode(rawMessage);
  return AUTH_FALLBACK_MESSAGE;
}
