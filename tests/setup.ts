/**
 * Vitest setup: run before every test file. Ensures a fresh test DB per run.
 * Each test file starts from a known, empty schema.
 */
import { beforeAll, afterAll } from 'vitest'
import { rmSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { execSync } from 'node:child_process'

const TEST_DB = resolve(process.cwd(), 'data/test.db')

// Force every test to use its own SQLite file, isolated from dev/prod.
process.env.DATABASE_URL = `file:${TEST_DB}`
process.env.SESSION_PASSWORD =
  process.env.SESSION_PASSWORD ??
  'test_session_password_32_chars_minimum_length_ok'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

beforeAll(() => {
  // Nuke any previous test DB files (including -wal/-shm siblings).
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const path = TEST_DB + suffix
    if (existsSync(path)) rmSync(path, { force: true })
  }
  mkdirSync(dirname(TEST_DB), { recursive: true })

  // Push the schema into the fresh file. drizzle-kit prints a lot — swallow it.
  execSync('npx drizzle-kit push --force', {
    env: {
      ...process.env,
      DATABASE_URL: `file:${TEST_DB}`,
    },
    stdio: 'ignore',
  })
})

afterAll(() => {
  // Keep the file for post-mortem; CI tears down the workspace anyway.
})
