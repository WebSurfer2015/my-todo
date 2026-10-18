import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", ".expo", "dist", "ios", "android"] },
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
      // React Compiler rules — OFF. They only matter when the React Compiler
      // auto-memoizes components, and this app doesn't use it. They flag
      // patterns the codebase relies on deliberately (e.g. the latest-value
      // ref read/written during render that keeps TaskItem callbacks stable —
      // see mobile/CLAUDE.md). Revisit if the React Compiler is ever adopted.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/immutability": "off",
      // Runtime-correctness hook rules stay strict.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-require-imports": "off",
      // Clean Architecture: mobile/ is the client — it talks to the backend
      // over HTTPS and must never import functions/ code. Editor-time nudge;
      // the authoritative gate is the repo-root `npm run lint:arch`.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/functions/**"],
              message:
                "mobile/ must not import server code from functions/. Call the Cloud Function over HTTPS; share pure logic via core/.",
            },
          ],
        },
      ],
    },
  },
);
