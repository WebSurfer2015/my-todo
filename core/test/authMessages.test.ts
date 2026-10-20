// Sign-in error copy: friendly, and never carries the raw Firebase code
// (that goes to logs via authErrorCode).
import { describe, expect, it } from "vitest";
import {
  AUTH_FALLBACK_MESSAGE,
  FIREBASE_AUTH_MESSAGES,
  authErrorCode,
  authErrorDiagnostic,
  mapFirebaseAuthError,
  stripAuthCode,
} from "../src/data/authMessages";

describe("mapFirebaseAuthError — no code in user-facing text", () => {
  it("every curated code maps without the code", () => {
    for (const code of Object.keys(FIREBASE_AUTH_MESSAGES)) {
      const out = mapFirebaseAuthError(code, undefined, "");
      expect(out).not.toContain("auth/");
      expect(out).toBe(FIREBASE_AUTH_MESSAGES[code]);
    }
    expect(mapFirebaseAuthError("auth/invalid-credential", "email", "x")).toBe("That email or password isn't right.");
  });

  it("internal-error gets calm per-provider copy — no code, no configuration jargon", () => {
    expect(mapFirebaseAuthError("auth/internal-error", "google", "")).toBe(
      "Couldn't sign in with Google just now. Please try again, or use another option.",
    );
    expect(mapFirebaseAuthError("auth/internal-error", "apple", "")).toBe(
      "Couldn't sign in with Apple just now. Please try again, or use another option.",
    );
    expect(mapFirebaseAuthError("auth/internal-error", "email", "")).toBe(
      "Couldn't sign you in just now. Please try again, or use another option.",
    );
  });

  it("no curated message carries configuration jargon", () => {
    for (const msg of Object.values(FIREBASE_AUTH_MESSAGES)) {
      expect(msg).not.toMatch(/OAuth|client ID|Service ID|handshake|misconfigured|for this build/i);
    }
  });

  it("a code mapped to '' passes the raw message through, code-stripped", () => {
    expect(mapFirebaseAuthError("auth/popup-closed-by-user", undefined, "[auth/popup-closed-by-user] Closed.")).toBe("Closed.");
    expect(mapFirebaseAuthError("auth/cancelled-popup-request", undefined, "")).toBe("");
  });

  it("an unmapped code gets the calm fallback, not the raw message", () => {
    expect(mapFirebaseAuthError("auth/some-future-code", undefined, "[auth/some-future-code] boom")).toBe(AUTH_FALLBACK_MESSAGE);
  });
});

describe("authErrorCode / stripAuthCode", () => {
  it("authErrorCode reads the code for logging", () => {
    expect(authErrorCode({ code: "auth/invalid-credential" })).toBe("auth/invalid-credential");
    expect(authErrorCode({ code: 1001 })).toBe("1001");
    expect(authErrorCode({ code: null })).toBe("");
    expect(authErrorCode({})).toBe("");
    expect(authErrorCode(null)).toBe("");
    expect(authErrorCode("auth/x")).toBe("");
  });

  it("stripAuthCode drops [auth/…] and (auth/…) tokens", () => {
    expect(stripAuthCode("[auth/network-request-failed] A network error occurred.")).toBe("A network error occurred.");
    expect(stripAuthCode("Failed (auth/internal-error) now")).toBe("Failed now");
    expect(stripAuthCode("plain")).toBe("plain");
  });

  it("stripAuthCode is case-insensitive", () => {
    expect(stripAuthCode("x [AUTH/Foo]")).toBe("x");
  });

  it("authErrorDiagnostic: code, flow and likely cause — for logs only", () => {
    expect(authErrorDiagnostic({ code: "auth/internal-error" }, "apple")).toBe(
      "auth/internal-error (apple): Apple Service ID or Sign-in-with-Apple key in Firebase Console out of sync",
    );
    expect(authErrorDiagnostic({ code: "auth/internal-error" }, "email")).toBe(
      "auth/internal-error (email): Firebase internal error — usually a credential/audience mismatch",
    );
    expect(authErrorDiagnostic({ code: "auth/user-not-found" })).toBe("auth/user-not-found");
    expect(authErrorDiagnostic(null)).toBe("(no code)");
    expect(authErrorDiagnostic({ code: "X" }, "google", { X: "extra" })).toBe("X (google): extra");
  });
});

describe("empty sign-in fields", () => {
  it("auth/missing-password and auth/missing-email get a calm prompt, not the generic fallback", () => {
    expect(mapFirebaseAuthError("auth/missing-password")).toBe("Enter your password.");
    expect(mapFirebaseAuthError("auth/missing-email")).toBe("Enter your email.");
  });
});
