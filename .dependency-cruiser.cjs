/**
 * Clean Architecture enforcement for the my-todo monorepo.
 *
 * One rule underlies all of these: source dependencies point INWARD.
 *
 *   frameworks/drivers (web/, mobile/: React, RN, Expo, Firebase, AsyncStorage)
 *     -> interface adapters (firestoreAdapter, useTodoStore, i18n bindings)
 *       -> use cases / domain (core/src: types, derive, persistence port, ...)
 *
 * core/ is the innermost ring: it may depend on NOTHING outside itself —
 * no platform package, no framework, and never "up" into web/ or mobile/.
 * web/ and mobile/ are sibling outer rings and must never import each other.
 *
 * Run: `npm run lint:arch` (from repo root). Wire into CI alongside tsc.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment:
        "Circular dependencies break the inward-pointing rule and make layers impossible to reason about. Refactor to a clear owner.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "core-stays-pure",
      comment:
        "core/ is the domain ring. It must never reach UP into a platform (web/ or mobile/). Move shared logic DOWN into core behind a port instead.",
      severity: "error",
      from: { path: "^core/src" },
      to: { path: "^(web|mobile)/" },
    },
    {
      name: "core-no-external-deps",
      comment:
        "core/ depends on zero external modules by design — no npm package (React, Firebase, Expo) AND no node builtin (fs, path). Node builtins break in React Native; npm framework code belongs in the adapter ring (web/ or mobile/) behind the StorageAdapter port.",
      severity: "error",
      from: { path: "^core/src" },
      to: {
        dependencyTypes: [
          "npm",
          "npm-dev",
          "npm-optional",
          "npm-peer",
          "npm-bundled",
          "npm-no-pkg",
          "core",
        ],
      },
    },
    {
      name: "no-cross-platform-web-to-mobile",
      comment:
        "web/ and mobile/ are independent outer rings. SHIPPED code shares through core/, never across platforms. Test files (*.test.*) are exempt: they don't ship, and some web tests exercise mobile React hooks via web's happy-dom/renderHook because mobile's node-only vitest can't render them.",
      severity: "error",
      from: { path: "^web/", pathNot: "\\.test\\.(ts|tsx)$" },
      to: { path: "^mobile/" },
    },
    {
      name: "no-cross-platform-mobile-to-web",
      comment:
        "web/ and mobile/ are independent outer rings. SHIPPED code shares through core/, never across platforms. Test files (*.test.*) are exempt — they don't ship.",
      severity: "error",
      from: { path: "^mobile/", pathNot: "\\.test\\.(ts|tsx)$" },
      to: { path: "^web/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
