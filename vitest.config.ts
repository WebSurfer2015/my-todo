import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Repo-root vitest, used ONLY for GATED CORE COVERAGE.
 *
 * The 27 web test files exercise core/ across the workspace boundary, but
 * the v8 coverage provider only instruments files under the runner's root.
 * Run from web/, core/ is `../core` (outside root) → reported as 0/0. So
 * this config runs the same web tests from the REPO ROOT (which contains
 * core/), letting v8 attribute the executed core lines. React/RTL resolve
 * from web/node_modules (node walks upward from the test files).
 *
 * Day-to-day testing still uses the per-package configs:
 *   - web:    `cd web && npm test`     (web/vitest.config.ts)
 *   - mobile: `cd mobile && npm test`  (mobile/vitest.config.ts)
 * This root config is invoked by `npm run test:coverage` + CI's coverage gate.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['web/src/**/*.test.{ts,tsx}'],
    // The React-hook tests (renderHook/RTL) run in web's own `npm test`;
    // under this root runner React resolves from web/node_modules and the
    // RTL renderer env differs. They cover web hooks, NOT core/, so
    // excluding them here costs zero core coverage — the pure-logic tests
    // (which import and exercise core) are what this run measures.
    exclude: [
      '**/node_modules/**',
      'web/tests/**',
      'web/src/use*.test.{ts,tsx}',
    ],
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['core/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        'core/src/index.ts',
        'core/src/**/index.ts',
        'core/src/domain/types.ts',
        // i18n is a 6-language string table (mostly data + per-language
        // formatter fns); line/fn coverage is meaningless here, same as
        // web/vitest.config.ts already excludes its i18n re-export.
        'core/src/data/i18n.ts',
      ],
      // Floor set just below the measured level (lines 89.7 / stmts 86 /
      // funcs 90 / branches 78 as of 2026-06) so any real regression
      // fails CI. Ratchet upward as coverage grows.
      thresholds: {
        lines: 88,
        statements: 85,
        functions: 88,
        branches: 76,
      },
    },
  },
})
