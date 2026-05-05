import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { LangProvider } from "./LangContext";
import { NotifyProvider } from "./notify";
import { ErrorBoundary } from "./ErrorBoundary";
import { AuthProvider } from "./AuthContext";

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
