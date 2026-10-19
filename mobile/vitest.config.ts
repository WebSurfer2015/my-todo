import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Mobile tests. Default environment is node (pure logic). Hook tests opt into
 * a DOM with a `// @vitest-environment happy-dom` header and render via
 * @testing-library/react's renderHook — they exercise the hooks' platform-
 * agnostic logic, not native UI.
 *
 * `react-native` is aliased to a small stub: RN's source is Flow-typed and
 * can't be transformed here, and the hooks only touch a few primitives
 * (e.g. AppState). RN component / native-bridge tests are out of scope.
 *
 *   npm test               — run the tests
 *   npm run test:coverage  — same, with the coverage floor below (CI)
 */
export default defineConfig({
  resolve: {
    alias: {
      'react-native': fileURLToPath(new URL('./vitest-stubs/react-native.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      // The testable shell: hooks, store, adapters and pure helpers. RN
      // screens / sheets (.tsx) are device-QA territory (see mobile/CLAUDE.md).
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', '**/*.d.ts', 'src/core-bindings/**'],
      // Floor ~2 points under the measured level (lines 59.6 / stmts 57.0 /
      // funcs 47.6 / branches 49.3 as of 2026-10-19, round 3) so a real
      // regression fails CI. Ratchet upward as coverage grows.
      thresholds: {
        lines: 57,
        statements: 55,
        functions: 45,
        branches: 47,
      },
    },
  },
})
