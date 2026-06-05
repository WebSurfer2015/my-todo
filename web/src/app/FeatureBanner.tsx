import { useState } from "react";

const DISMISS_KEY = "sagely.webFeatureBanner.dismissed";

/**
 * Web is INTENTIONALLY the minimal surface (the task #5 decision: web stays
 * minimal, mobile is the superset). Basic todos / categories / filters live
 * here; the richer features — reminders, recurring tasks, shopping lists —
 * are mobile-only.
 *
 * This dismissible banner is the "guard": it sets that expectation so a web
 * user doesn't hunt for missing features, and isn't surprised that a
 * recurring task or grocery item they made on mobile shows as a plain todo
 * (or not at all) here. Note there's no DATA risk — web edits go through the
 * same core mutations, which preserve recurrence/reminder/series fields they
 * don't render; this is purely expectation-setting. Dismissal persists in
 * localStorage. Inline-styled (no CSS-class dependency), like ErrorBoundary.
 */
export default function FeatureBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode / storage disabled — just hide for the session */
    }
    setDismissed(true);
  };

  return (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 14px",
        margin: "0 0 8px",
        fontSize: 13,
        lineHeight: 1.4,
        color: "var(--text-secondary, #555)",
        background: "var(--surface-2, #f3f4f6)",
        borderRadius: 8,
      }}
    >
      <span style={{ flex: 1 }}>
        Reminders, recurring tasks, and shopping lists live in the Sagely
        mobile app — the web app keeps things to simple to-dos.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: 15,
          color: "inherit",
          opacity: 0.6,
          padding: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}
