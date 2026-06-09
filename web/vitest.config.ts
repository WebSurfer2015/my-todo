import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Vitest-specific config. Separate from vite.config.ts so the build
 * pipeline doesn't have to load test infrastructure.
 *
 * Coverage notes:
 *   - V8 provider, html + json-summary so CI can both browse the
 *     artifact and parse the summary numbers.
 *   - The actual test suite covers `core/*` and a handful of
 *     `mobile/src/*` modules through relative imports, but v8 +
 *     Vite + cross-workspace boundaries make it tricky to attribute
 *     those reads back as covered lines in this report. So this
 *     config focuses coverage on web/src itself (where we have no
 *     tests yet — every file at 0% is a real opportunity).
 *   - Thresholds intentionally NOT set: the right time to add them
 *     is after web/src component tests land. The 378-test green
 *     status from CI is today's gate.
 *
 * Future work:
 *   - Migrate to a vitest workspace (top-level vitest.config) so
 *     core/ and mobile/ tests run in a unified report.
 *   - Add component tests for web/src (CategoryPopover, Sidebar,
 *     SignIn, TaskItem, AddTask) using RTL + happy-dom.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // NOTE: core/ can't be attributed here — v8 only instruments files
      // under this project's (web/) root, so cross-workspace `../core/src`
      // reads as 0/0 even though the suite exercises it heavily. Real,
      // gateable core coverage needs a repo-root vitest workspace
      // (root config + projects: ['web', ...]). Tracked as P1-coverage.
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        // Re-exports / type-only modules — coverage is meaningless.
        'src/categories.ts',
        'src/groceries.ts',
        'src/groups.ts',
        'src/i18n.ts',
        'src/persistence.ts',
        'src/profile.ts',
        'src/selection.ts',
      ],
      // NOTE: a GATED coverage threshold can't live here. The 27 test
      // files exercise core/ (imported across the workspace boundary),
      // but v8 only instruments files under this project's root (web/),
      // so core/ reads as 0/0 from here and web/src is the untested UI
      // shell. A meaningful, gateable core-coverage number requires a
      // repo-root vitest workspace (root-level vitest + plugins as
      // devDeps, projects: ['web', ...], coverage.include core/src).
      // Tracked as P1-coverage; until then this report is artifact-only.
    },
  },
})
