import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import "./index.css";
import App from "./App";
import { LangProvider } from "./LangContext";
import { NotifyProvider } from "./notify";
import { ErrorBoundary } from "./ErrorBoundary";
import { AuthProvider } from "./AuthContext";

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
