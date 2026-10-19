/**
 * Map auth-flow errors (Firebase, Apple, Google native, network) to a
 * user-readable string. Unknown errors get calm copy — never the raw SDK
 * message or code, and never configuration jargon; SignIn logs the code
 * (authErrorDiagnostic) to Crashlytics for diagnosis.
 *
 * The platform-pure Firebase `auth/*` code map, the fallback copy and the
 * code / diagnostic helpers live in core/src/data/authMessages.ts (shared,
 * no RN deps). The Apple/Google NATIVE-SDK maps below are SDK-specific and
 * stay mobile-side, layered on top of the core Firebase lookup.
 */

import {
  AUTH_FALLBACK_MESSAGE,
  AuthFlow,
  authErrorDiagnostic as coreDiagnostic,
  mapFirebaseAuthError,
  providerFailedMessage,
} from "../../../core/src/data/authMessages";

export type { AuthFlow };

interface ErrLike {
  code?: string | number;
  message?: string;
}

const APPLE_FAILED = providerFailedMessage("apple");
const GOOGLE_FAILED = providerFailedMessage("google");

/** Apple native SDK codes ("" = the user cancelled: show nothing). */
const APPLE_NATIVE_MESSAGES: Record<string, string> = {
  // ASAuthorizationError codes from AuthenticationServices.framework
  "1000": "Apple Sign-In is not available. Sign in to iCloud on this device and try again.",
  "1001": "", // cancelled
  "1002": "Apple Sign-In couldn't complete. Try again.",
  "1003": "Apple Sign-In isn't handling this request right now. Try again.",
  "1004": "Apple Sign-In failed. Try again, or use a different option.",
  ERR_REQUEST_UNKNOWN: "Apple Sign-In failed unexpectedly. Try again.",
  ERR_REQUEST_NOT_HANDLED: APPLE_FAILED,
  ERR_REQUEST_NOT_INTERACTIVE: "Apple Sign-In needs a fresh tap. Try again.",
  ERR_INVALID_RESPONSE: "Apple Sign-In returned an unexpected response. Try again.",
  ERR_INVALID_OPERATION: "Apple Sign-In couldn't complete. Try again.",
  ERR_INVALID_SCOPE: APPLE_FAILED,
};

const GOOGLE_NATIVE_MESSAGES: Record<string, string> = {
  PLAY_SERVICES_NOT_AVAILABLE:
    "Google Play Services is required and not available.",
  SIGN_IN_REQUIRED: "Sign in with Google again to continue.",
  DEVELOPER_ERROR: GOOGLE_FAILED,
  NETWORK_ERROR:
    "Can't reach Google to sign in. Check your connection and try again.",
};

/** What a native code most likely means — for the crash log only. */
const NATIVE_DIAGNOSTICS: Record<string, string> = {
  ERR_REQUEST_NOT_HANDLED: "Sign in with Apple capability / entitlement missing in this build",
  ERR_INVALID_SCOPE: "Apple Sign-In requested scope misconfigured",
  DEVELOPER_ERROR: "Google Sign-In misconfigured (client IDs / SHA fingerprint) for this build",
};

/** One line for the crash log (code, flow, likely cause) — never shown. */
export function authErrorDiagnostic(err: unknown, flow?: AuthFlow): string {
  return coreDiagnostic(err, flow, NATIVE_DIAGNOSTICS);
}

export function mapAuthError(err: unknown, flow?: AuthFlow): string {
  const e = (err ?? {}) as ErrLike;
  const code = e.code != null ? String(e.code) : "";
  const rawMessage = (e.message ?? "").trim();

  // 1. Known Firebase auth codes (platform-pure map in core)
  if (code.startsWith("auth/")) {
    return mapFirebaseAuthError(code, flow, rawMessage);
  }

  // 2. Apple native SDK codes ("" = cancelled: nothing to show — never the
  //    raw SDK message).
  if (code in APPLE_NATIVE_MESSAGES) return APPLE_NATIVE_MESSAGES[code];

  // 3. Google native SDK codes
  if (code in GOOGLE_NATIVE_MESSAGES) return GOOGLE_NATIVE_MESSAGES[code];

  // 4. Provider-specific thrown messages from AuthContext fallbacks
  if (rawMessage.includes("no identity token")) {
    return "Apple Sign-In didn't return credentials. Make sure you're signed in to iCloud on this device.";
  }
  if (rawMessage.includes("no idToken")) {
    return "Google Sign-In didn't return credentials. Try again or use a different account.";
  }

  // 5. Network-ish hints
  if (/network|offline|timeout|fetch/i.test(rawMessage)) {
    return "Can't reach the sign-in server. Check your connection and try again.";
  }

  // 6. Fallback: calm copy (the code goes to Crashlytics, not the screen).
  return AUTH_FALLBACK_MESSAGE;
}
