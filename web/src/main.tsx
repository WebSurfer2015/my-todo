import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import "./index.css";
import App from "./app/App";
import { LangProvider } from "./app/LangContext";
import { NotifyProvider } from "./app/notify";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { AuthProvider } from "./app/AuthContext";

// Initialize Sentry only when DSN is set (set VITE_SENTRY_DSN in .env or
// hosting env). No-op until then so dev builds don't accidentally report.
const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

// Global handlers so errors OUTSIDE React's render tree are captured too —
// unhandled promise rejections (sync writes, AI calls, hydration) and
// non-React runtime errors were previously silent in prod. captureException
// is a no-op when Sentry has no DSN, so dev stays quiet.
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled rejection:", e.reason);
  Sentry.captureException(e.reason);
});
window.addEventListener("error", (e) => {
  Sentry.captureException(e.error ?? e.message);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <LangProvider>
          <NotifyProvider>
            <App />
          </NotifyProvider>
        </LangProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
