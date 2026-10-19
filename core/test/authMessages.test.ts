// Sign-in error copy: friendly, and never carries the raw Firebase code
// (that goes to logs via authErrorCode).
import { describe, expect, it } from "vitest";
import {
  AUTH_FALLBACK_MESSAGE,
  FIREBASE_AUTH_MESSAGES,
  appendCode,
  authErrorCode,
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

  it("internal-error gets flow-specific guidance (no code)", () => {
    expect(mapFirebaseAuthError("auth/internal-error", "google", "")).toContain("OAuth web client ID");
    expect(mapFirebaseAuthError("auth/internal-error", "apple", "")).toContain("Apple Service ID");
    expect(mapFirebaseAuthError("auth/internal-error", "email", "")).toBe("Sign-in handshake failed.");
    for (const flow of ["google", "apple"] as const) {
      expect(mapFirebaseAuthError("auth/internal-error", flow, "")).not.toContain("auth/");
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

describe("authErrorCode / stripAuthCode / appendCode", () => {
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

  it("appendCode (diagnostics) appends only a non-empty code", () => {
    expect(appendCode("m", "auth/x")).toBe("m (auth/x)");
    expect(appendCode("m", "")).toBe("m");
  });
});
