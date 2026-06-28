/**
 * Map auth-flow errors (Firebase, Apple, Google native, network) to a
 * user-readable string. Unknown errors fall back to the raw message plus
 * the code in parens so debugging never requires a Metro session.
 *
 * The platform-pure Firebase `auth/*` code map + lookup live in
 * core/src/data/authMessages.ts (shared, no RN deps). The Apple/Google
 * NATIVE-SDK maps below are SDK-specific and stay mobile-side, layered on
 * top of the core Firebase lookup.
 *
 * The Apple/Google native SDKs throw their own error shapes; we surface
 * those too so the visible message is never just a silent failure.
 */

import {
  AuthFlow,
  appendCode,
  mapFirebaseAuthError,
} from "../../../core/src/data/authMessages";

export type { AuthFlow };

interface ErrLike {
  code?: string | number;
  message?: string;
}

const APPLE_NATIVE_MESSAGES: Record<string, string> = {
  // ASAuthorizationError codes from AuthenticationServices.framework
  "1000": "Apple Sign-In is not available. Sign in to iCloud on this device and try again.",
  "1001": "", // cancelled
  "1002": "Apple Sign-In couldn't complete. Try again.",
  "1003": "Apple Sign-In isn't handling this request right now. Try again.",
  "1004": "Apple Sign-In failed. Try again, or use a different option.",
  ERR_REQUEST_UNKNOWN: "Apple Sign-In failed unexpectedly. Try again.",
  ERR_REQUEST_NOT_HANDLED:
    "Apple Sign-In is not configured for this build. The app needs to be updated.",
  ERR_REQUEST_NOT_INTERACTIVE: "Apple Sign-In needs a fresh tap. Try again.",
  ERR_INVALID_RESPONSE:
    "Apple Sign-In returned an unexpected response. Try again.",
  ERR_INVALID_OPERATION: "Apple Sign-In couldn't complete. Try again.",
  ERR_INVALID_SCOPE: "Apple Sign-In scope is misconfigured for this build.",
};

const GOOGLE_NATIVE_MESSAGES: Record<string, string> = {
  PLAY_SERVICES_NOT_AVAILABLE:
    "Google Play Services is required and not available.",
  SIGN_IN_REQUIRED: "Sign in with Google again to continue.",
  DEVELOPER_ERROR:
    "Google Sign-In is misconfigured for this build. The app needs to be updated.",
  NETWORK_ERROR:
    "Can't reach Google to sign in. Check your connection and try again.",
};

export function mapAuthError(err: unknown, flow?: AuthFlow): string {
  const e = (err ?? {}) as ErrLike;
  const code = e.code != null ? String(e.code) : "";
  const rawMessage = (e.message ?? "").trim();

  // 1. Known Firebase auth codes (platform-pure map in core)
  if (code.startsWith("auth/")) {
    return mapFirebaseAuthError(code, flow, rawMessage);
  }

  // 2. Apple native SDK codes
  if (code in APPLE_NATIVE_MESSAGES) {
    const mapped = APPLE_NATIVE_MESSAGES[code];
    return mapped || rawMessage;
  }

  // 3. Google native SDK codes
  if (code in GOOGLE_NATIVE_MESSAGES) {
    return GOOGLE_NATIVE_MESSAGES[code] || rawMessage;
  }

  // 4. Provider-specific thrown messages from AuthContext fallbacks
  if (rawMessage.includes("no identity token")) {
    return "Apple Sign-In didn't return credentials. Make sure you're signed in to iCloud on this device.";
  }
  if (rawMessage.includes("no idToken")) {
    return "Google Sign-In didn't return credentials. Try again or use a different account.";
  }

  // 5. Network-ish hints
  if (/network|offline|timeout|fetch/i.test(rawMessage)) {
    return appendCode(
      "Can't reach the sign-in server. Check your connection and try again.",
      code,
    );
  }

  // 6. Fallback: show raw message + code so future incidents are diagnosable
  return appendCode(rawMessage || "Sign-in failed.", code);
}
