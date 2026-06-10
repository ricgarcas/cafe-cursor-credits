import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // E2E tests live under /e2e and are run by Playwright.
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    setupFiles: ['./tests/setup.ts'],
    // Every test file resets the same data/test.db in beforeAll — parallel
    // files would nuke it out from under each other (SQLITE_BUSY / missing
    // tables). Serialize file execution so each owns the DB for its run.
    fileParallelism: false,
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**'],
      exclude: ['src/lib/**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(fileURLToPath(new URL('.', import.meta.url)), 'src'),
      // `server-only` guards modules from client bundles in Next, but throws in
      // Vitest where the runtime is Node. Swap for a no-op shim.
      'server-only': resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        'tests/server-only-shim.ts',
      ),
    },
  },
})
