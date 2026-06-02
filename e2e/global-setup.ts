/**
 * Runs once before the Playwright test suite. Wipes the E2E SQLite file and
 * re-applies the schema so every run starts from a clean slate.
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const E2E_DB = resolve(process.cwd(), 'data/e2e.db')

export default async function globalSetup() {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const path = E2E_DB + suffix
    if (existsSync(path)) rmSync(path, { force: true })
  }
  mkdirSync(dirname(E2E_DB), { recursive: true })

  execSync('npx drizzle-kit push --force', {
    env: {
      ...process.env,
      DATABASE_URL: `file:${E2E_DB}`,
    },
    stdio: 'inherit',
  })
}
