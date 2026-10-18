import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Mobile tests. Default environment is node (pure logic). Hook tests opt into
 * a DOM with a `// @vitest-environment happy-dom` header and render via
 * @testing-library/react's renderHook — they exercise the hooks' platform-
 * agnostic logic, not native UI.
 *
 * `react-native` is aliased to an inert stub: RN's source is Flow-typed and
 * can't be transformed here, and the hooks only touch a few primitives
 * (e.g. AppState). RN component / native-bridge tests are out of scope.
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
  },
})
