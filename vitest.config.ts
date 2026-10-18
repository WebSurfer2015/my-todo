import { defineConfig } from 'vitest/config'

/**
 * Repo-root vitest = the core/ package's test suite (core/test/*.test.ts) and
 * its gated coverage. core/ is pure TypeScript (no React, no RN), so tests run
 * in node. Mobile hook tests live in mobile/, server tests in functions/.
 *
 *   npm test               — run core's tests
 *   npm run test:coverage  — same, with the coverage thresholds below (CI)
 */
export default defineConfig({
  test: {
    include: ['core/test/**/*.test.ts'],
    environment: 'node',
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
        // formatter fns); line/fn coverage is meaningless here.
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
