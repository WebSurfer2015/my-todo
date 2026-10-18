/**
 * Clean Architecture enforcement for the my-todo repo.
 *
 * One rule underlies all of these: source dependencies point INWARD.
 *
 *   frameworks/drivers (mobile/: React Native, Expo, Firebase, AsyncStorage)
 *     -> interface adapters (firestoreAdapter, useTodoStore, i18n bindings)
 *       -> use cases / domain (core/src: types, derive, persistence port, ...)
 *
 * core/ is the innermost ring: it may depend on NOTHING outside itself —
 * no platform package, no framework, and never "up" into mobile/ or functions/.
 * functions/ (the Cloud Functions backend) deploys standalone, so its shipped
 * code imports neither core/ nor mobile/; mobile/ never imports server code.
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
        "core/ is the domain ring. It must never reach UP into mobile/ or functions/. Move shared logic DOWN into core behind a port instead.",
      severity: "error",
      from: { path: "^core/src" },
      to: { path: "^(mobile|functions)/" },
    },
    {
      name: "core-no-external-deps",
      comment:
        "core/ depends on zero external modules by design — no npm package (React, Firebase, Expo) AND no node builtin (fs, path). Node builtins break in React Native; npm framework code belongs in the adapter ring (mobile/) behind the StorageAdapter port.",
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
      name: "mobile-not-server",
      comment:
        "mobile/ is the client. It talks to the backend over HTTPS only — never by importing functions/ code. Test files are exempt (parity guards read server files).",
      severity: "error",
      from: { path: "^mobile/", pathNot: "\\.test\\.(ts|tsx)$" },
      to: { path: "^functions/" },
    },
    {
      name: "functions-standalone",
      comment:
        "functions/ deploys on its own (tsconfig rootDir is src), so shipped server code can't import core/ or mobile/ — it keeps its own copies, guarded by parity tests. Test files are exempt.",
      severity: "error",
      from: { path: "^functions/src", pathNot: "\\.test\\.ts$" },
      to: { path: "^(core|mobile)/" },
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
