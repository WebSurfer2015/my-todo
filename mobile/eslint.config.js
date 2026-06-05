import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", ".expo", "dist", "ios", "android", "web-build"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler advisory rules — kept as warnings (the compiler's
      // optimization hints, not runtime-correctness rules). rules-of-hooks
      // and exhaustive-deps stay at error. Consistent with the two below.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
      // Clean Architecture: mobile/ is an outer ring. It must never import the
      // web/ sibling platform — shared logic belongs in core/ behind a port.
      // Editor-time nudge only ("warn"); the authoritative, baseline-aware gate
      // is the repo-root `npm run lint:arch` (../.dependency-cruiser.cjs).
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["**/web/**"],
              message:
                "mobile/ must not import from web/. Share cross-platform logic via core/ behind a port.",
            },
          ],
        },
      ],
    },
  },
);
