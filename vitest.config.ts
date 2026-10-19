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
        'core/src/domain/types.ts',
        // i18n is a 6-language string table (mostly data + per-language
        // formatter fns); line/fn coverage is meaningless here.
        'core/src/data/i18n.ts',
      ],
      // Floor set ~1.5 points below the measured level (lines 97.0 / stmts
      // 94.2 / funcs 96.2 / branches 89.0 as of 2026-10-19) so any real
      // regression fails CI. Ratchet upward as coverage grows.
      thresholds: {
        lines: 95.5,
        statements: 92.5,
        functions: 94.5,
        branches: 87.5,
      },
    },
  },
})
