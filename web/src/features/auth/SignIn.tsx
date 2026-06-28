import { useState } from "react";
import { useAuth } from "../../app/AuthContext";
import { useLang } from "../../app/LangContext";
import { Lang, LANG_NAMES, LANG_ORDER } from "../../../../core/src/data/i18n";
import { AuthFlow, mapFirebaseAuthError } from "../../../../core/src/data/authMessages";

type Mode = "social" | "signin" | "signup" | "reset";

/**
 * Turn a thrown auth error into friendly copy. Firebase `auth/*` codes route
 * through the shared core map (same source mobile's authErrors uses);
 * anything else falls back to its raw message. Keeps "Firebase: Error
 * (auth/invalid-credential)" strings off the screen.
 */
function authErrorMessage(err: unknown, flow: AuthFlow): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  const rawMessage =
    err instanceof Error ? err.message : String(err ?? "");
  if (code.startsWith("auth/")) {
    return mapFirebaseAuthError(code, flow, rawMessage);
  }
  return rawMessage;
}

export default function SignIn() {
  const { t } = useLang();
  const {
    signIn,
    signUp,
    signInWithApple,
    signInWithGoogle,
    resetPassword,
  } = useAuth();
  const [mode, setMode] = useState<Mode>("social");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  function switchMode(next: Mode) {
    setError(null);
    setResetSent(false);
    setMode(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else if (mode === "signup") {
        await signUp(email.trim(), password, { firstName, lastName });
      } else if (mode === "reset") {
        await resetPassword(email.trim());
        setResetSent(true);
      }
    } catch (err) {
      setError(authErrorMessage(err, "email"));
    } finally {
      setBusy(false);
    }
  }

  // Wraps a provider call so popup-cancel doesn't surface as an error.
  async function withProvider(
    fn: () => Promise<void>,
    flow: AuthFlow,
    cancelCodes: string[],
  ) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string } | null)?.code ?? "";
      if (cancelCodes.some((c) => msg.includes(c) || code === c)) return;
      setError(authErrorMessage(err, flow));
    } finally {
      setBusy(false);
    }
  }

  const handleApple = () =>
    withProvider(signInWithApple, "apple", ["popup-closed-by-user", "auth/cancelled-popup-request"]);
  const handleGoogle = () =>
    withProvider(signInWithGoogle, "google", ["popup-closed-by-user", "auth/cancelled-popup-request"]);

  return (
    <div className="signin-shell">
      <div className="signin-card">
        <LangPicker />

        <img
          className="signin-icon"
          src="/apple-touch-icon.png"
          alt="Sagely"
          width={72}
          height={72}
        />
        <h1 className="signin-title">Sagely</h1>
        <p className="signin-subtitle">
          {mode === "reset" ? t.resetPasswordPrompt : t.signInTagline}
        </p>

        {/* SOCIAL PROVIDERS — Apple, Google (landing only) */}
        {mode === "social" && (
          <div className="signin-providers">
            <button
              type="button"
              className="signin-social signin-apple"
              onClick={handleApple}
              disabled={busy}
              aria-label={t.signInWithApple}
            >
              <svg width="16" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
                <path d="M11.6 9.5c0-2 1.6-3 1.7-3-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.4 0-2.6.8-3.3 2C-.1 9 .9 12.7 2.4 14.7c.7 1 1.6 2.1 2.7 2 1.1 0 1.5-.7 2.8-.7 1.3 0 1.7.7 2.8.7 1.2 0 1.9-1 2.6-2 .8-1.2 1.1-2.3 1.2-2.4-.1 0-2.3-.9-2.4-3.4zM9.5 3.6c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.6.6-1.1 1.6-.9 2.6 1 .1 2 -.5 2.5-1.2z" />
              </svg>
              {t.signInWithApple}
            </button>

            <button
              type="button"
              className="signin-social signin-google"
              onClick={handleGoogle}
              disabled={busy}
              aria-label={t.signInWithGoogle}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" />
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" />
              </svg>
              {t.signInWithGoogle}
            </button>

            <button
              type="button"
              className="signin-toggle signin-toggle-emphasis"
              onClick={() => switchMode("signin")}
              disabled={busy}
            >
              {t.signInWithEmail}
            </button>

            <button
              type="button"
              className="signin-toggle"
              onClick={() => switchMode("signup")}
              disabled={busy}
            >
              {t.createAccountToggle}
            </button>
          </div>
        )}

        {/* EMAIL FORM */}
        {mode !== "social" && (
          <form onSubmit={submit} className="signin-form">
            {mode === "signup" && (
              <div className="signin-field-row">
                <label className="signin-field">
                  <span className="signin-label">
                    {t.profileFirstNameLabel}
                    <span className="signin-required"> *</span>
                  </span>
                  <input
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={busy}
                    maxLength={40}
                  />
                </label>
                <label className="signin-field">
                  <span className="signin-label">{t.profileLastNameLabel}</span>
                  <input
                    type="text"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={busy}
                    maxLength={40}
                  />
                </label>
              </div>
            )}

            <label className="signin-field">
              <span className="signin-label">{t.emailLabel}</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>

            {mode !== "reset" && (
              <label className="signin-field">
                <span className="signin-label">{t.passwordLabel}</span>
                <input
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}

            {error && <p className="signin-error">{error}</p>}
            {resetSent && mode === "reset" && (
              <p className="signin-success">{t.resetEmailSent}</p>
            )}

            <button
              type="submit"
              className="btn btn-primary signin-submit"
              disabled={busy}
            >
              {busy
                ? "…"
                : mode === "signin"
                  ? t.signInAction
                  : mode === "signup"
                    ? t.createAccountAction
                    : t.sendResetEmail}
            </button>
          </form>
        )}

        {/* MODE TOGGLES */}
        {mode === "signin" && (
          <button
            type="button"
            className="signin-toggle"
            onClick={() => switchMode("reset")}
          >
            {t.forgotPassword}
          </button>
        )}

        {(mode === "signup" || mode === "reset") && (
          <button
            type="button"
            className="signin-toggle"
            onClick={() => switchMode("signin")}
          >
            {mode === "reset" ? t.backToSignIn : t.haveAccountToggle}
          </button>
        )}

        {mode !== "social" && (
          <button
            type="button"
            className="signin-toggle"
            onClick={() => switchMode("social")}
          >
            {t.backToAllOptions}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Small language picker shown top-right of the auth card. Persists via
 * LangProvider's existing localStorage handling — selection survives reload.
 */
function LangPicker() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="signin-lang">
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label={t.languageLabel}
      >
        {LANG_ORDER.map((l) => (
          <option key={l} value={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
