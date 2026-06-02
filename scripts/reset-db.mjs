#!/usr/bin/env node
/**
 * Wipes the local SQLite database so the next visit triggers the
 * first-admin bootstrap. Dev convenience — don't run in production.
 *
 *   npm run db:reset
 */
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()
const DB_PATH = resolve(ROOT, 'data/app.db')

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const path = DB_PATH + suffix
  if (existsSync(path)) {
    rmSync(path, { force: true })
    console.log(`· removed ${path}`)
  }
}

console.log('· re-applying schema via drizzle-kit push…')
execSync('npx drizzle-kit push --force', {
  env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
  stdio: 'inherit',
})

console.log('')
console.log('  ✓ Database reset.')
console.log('')
console.log('  IMPORTANT: restart `npm run dev` before refreshing the browser.')
console.log('  The dev server keeps a file handle open to the old inode, so it')
console.log('  will still read stale data until you kill and restart it.')
console.log('')
console.log('  After restarting, any route will redirect to /admin-register')
console.log('  so you can recreate the admin.')
console.log('')
