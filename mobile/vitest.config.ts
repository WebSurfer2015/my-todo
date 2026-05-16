import { defineConfig } from 'vitest/config'

/**
 * Vitest config for mobile pure-logic tests. Node environment — no jsdom,
 * no React Native test renderer. Test files (mobile/src/__tests__/*.test.ts)
 * may only import modules that don't reach into RN's native bridge or React
 * APIs. RN component tests would need Jest + jest-expo and are out of
 * scope; if you need to test a hook that uses AccessibilityInfo, etc.,
 * add the coverage in web/ against shared core helpers instead.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
})
