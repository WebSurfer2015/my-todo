import { defineConfig } from 'vitest/config'

/** Firestore security-rules tests — run against the emulator via
 * `npm run test:rules` (needs JDK 21+ and the Firebase CLI). Kept out of the
 * default `npm test` so it doesn't need the emulator. */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
