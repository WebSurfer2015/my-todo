import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      // index.ts is no longer excluded: agentChat is a thin shell over
      // agentChatCore.ts and is tested with mocked boundaries (index.test.ts).
      exclude: ['**/*.test.ts'],
      // Floor at the level reached 2026-10-19 round 2 (measured minus ~1). Raise it as
      // coverage grows; never lower it to make a PR pass.
      thresholds: {
        statements: 87,
        branches: 85,
        functions: 87,
        lines: 89,
      },
    },
  },
})
