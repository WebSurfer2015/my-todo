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
