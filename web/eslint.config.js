import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Context providers + their hooks legitimately co-export.
      "react-refresh/only-export-components": "off",
      // React 19 / React Compiler strict patterns fight valid React-18
      // idioms we use deliberately (latest-ref pattern, ephemeral state
      // resets keyed on derived conditions). Keep as warnings until we
      // commit to React Compiler.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // Clean Architecture: web/ is an outer ring. It must never import the
      // mobile/ sibling platform — shared logic belongs in core/ behind a port.
      // Editor-time nudge only ("warn", matching this config's all-warnings
      // convention); the authoritative, baseline-aware gate is the repo-root
      // `npm run lint:arch` (../.dependency-cruiser.cjs).
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["**/mobile/**"],
              message:
                "web/ must not import from mobile/. Share cross-platform logic via core/ behind a port.",
            },
          ],
        },
      ],
    },
  },
);
