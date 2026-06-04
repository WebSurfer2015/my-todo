/**
 * Map auth-flow errors (Firebase, Apple, Google native, network) to a
 * user-readable string. Unknown errors fall back to the raw message plus
 * the code in parens so debugging never requires a Metro session.
 *
 * Codes worth flagging specifically:
 *   - auth/invalid-api-key, auth/app-not-authorized: the bundled
 *     GoogleService-Info.plist or google-services.json is stale; the app
 *     needs a rebuild with fresh config. See docs/AUTH-RECOVERY.md.
 *   - auth/operation-not-allowed: the provider (apple.com / google.com)
 *     is disabled in Firebase Console.
 *   - auth/network-request-failed: device offline or Firebase unreachable.
 *
 * The Apple/Google native SDKs throw their own error shapes; we surface
 * those too so the visible message is never just a silent failure.
 */

interface ErrLike {
  code?: string | number;
  message?: string;
}

export type AuthFlow = "apple" | "google" | "email";

const FIREBASE_AUTH_MESSAGES: Record<string, string> = {
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

  // 1. Known Firebase auth codes
  if (code.startsWith("auth/")) {
    // auth/internal-error needs flow-specific guidance — Firebase's
    // catch-all is almost always a configuration drift in Firebase Console.
    if (code === "auth/internal-error") {
      if (flow === "google") {
        return appendCode(
          "Google sign-in handshake failed. The OAuth web client ID in this build doesn't match what Firebase expects. The app needs to be updated.",
          code,
        );
      }
      if (flow === "apple") {
        return appendCode(
          "Apple sign-in handshake failed. The Apple Service ID or Sign-in-with-Apple key in Firebase Console may be out of sync. The app needs to be updated.",
          code,
        );
      }
    }
    const mapped = FIREBASE_AUTH_MESSAGES[code];
    if (mapped !== undefined) return appendCode(mapped || rawMessage, code);
    return appendCode(`Sign-in failed: ${rawMessage || "unknown Firebase error"}`, code);
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

function appendCode(msg: string, code: string): string {
  if (!code) return msg;
  return `${msg} (${code})`;
}
