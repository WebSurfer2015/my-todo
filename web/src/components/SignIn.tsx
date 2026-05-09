import { useState } from "react";
import { useAuth } from "../AuthContext";
import { useLang } from "../LangContext";

export default function SignIn() {
  const { t } = useLang();
  const { signIn, signUp, signInWithApple } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleApple() {
    setError(null);
    setBusy(true);
    try {
      await signInWithApple();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // auth/popup-closed-by-user is benign — user just dismissed the popup
      if (!msg.includes("popup-closed-by-user")) setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-shell">
      <div className="signin-card">
        <h1 className="signin-title">{t.title}</h1>
        <p className="signin-subtitle">
          {mode === "signin"
            ? "Sign in to sync your tasks across devices."
            : "Create an account to sync your tasks across devices."}
        </p>
        <form onSubmit={submit} className="signin-form">
          <label className="signin-field">
            <span className="signin-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="signin-field">
            <span className="signin-label">Password</span>
            <input
              type="password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && <p className="signin-error">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary signin-submit"
            disabled={busy}
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="signin-divider"><span>or</span></div>
        <button
          type="button"
          className="signin-apple"
          onClick={handleApple}
          disabled={busy}
          aria-label="Sign in with Apple"
        >
          <svg
            width="16"
            height="18"
            viewBox="0 0 14 18"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M11.6 9.5c0-2 1.6-3 1.7-3-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.4 0-2.6.8-3.3 2C-.1 9 .9 12.7 2.4 14.7c.7 1 1.6 2.1 2.7 2 1.1 0 1.5-.7 2.8-.7 1.3 0 1.7.7 2.8.7 1.2 0 1.9-1 2.6-2 .8-1.2 1.1-2.3 1.2-2.4-.1 0-2.3-.9-2.4-3.4zM9.5 3.6c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.6.6-1.1 1.6-.9 2.6 1 .1 2 -.5 2.5-1.2z"/>
          </svg>
          Sign in with Apple
        </button>

        <button
          type="button"
          className="signin-toggle"
          onClick={() => {
            setError(null);
            setMode((m) => (m === "signin" ? "signup" : "signin"));
          }}
        >
          {mode === "signin"
            ? "Don't have an account? Create one"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
