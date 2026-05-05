import { useState } from "react";
import { useAuth } from "../AuthContext";
import { useLang } from "../LangContext";

export default function SignIn() {
  const { t } = useLang();
  const { signIn, signUp } = useAuth();
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
