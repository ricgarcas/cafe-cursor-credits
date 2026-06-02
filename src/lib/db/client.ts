import 'server-only'
import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import * as schema from './schema'

/**
 * One driver, two modes:
 *   • Local file:  DATABASE_URL=file:./data/app.db
 *   • Turso:       DATABASE_URL=libsql://xxx.turso.io  +  DATABASE_AUTH_TOKEN=...
 *
 * Same Drizzle queries work against both. Keeping the driver in one place means
 * Railway/Fly (local volume) and Vercel (Turso) deploy from identical code.
 */
const RAW_URL = process.env.DATABASE_URL ?? 'file:./data/app.db'
// Tolerate bare paths ("./data/app.db") for backwards compatibility with early
// .env.local files — libsql requires a `file:` prefix.
const DB_URL = RAW_URL.startsWith('file:') || RAW_URL.startsWith('libsql:')
  ? RAW_URL
  : `file:${RAW_URL}`

type GlobalCache = typeof globalThis & {
  __ccLibsql?: Client
  __ccDb?: LibSQLDatabase<typeof schema>
}
const g = globalThis as GlobalCache

function ensureLocalDir() {
  if (!DB_URL.startsWith('file:')) return
  // file:./data/app.db → ./data/app.db
  const path = DB_URL.replace(/^file:/, '')
  try {
    mkdirSync(dirname(resolve(path)), { recursive: true })
  } catch {
    // ignore — surfaces as a connect error if truly broken
  }
}

function getClient(): Client {
  if (g.__ccLibsql) return g.__ccLibsql
  ensureLocalDir()
  g.__ccLibsql = createClient({
    url: DB_URL,
    authToken: DB_URL.startsWith('libsql:')
      ? process.env.DATABASE_AUTH_TOKEN
      : undefined,
  })
  return g.__ccLibsql
}

function getDb(): LibSQLDatabase<typeof schema> {
  if (g.__ccDb) return g.__ccDb
  g.__ccDb = drizzle(getClient(), { schema })
  return g.__ccDb
}

/**
 * Lazy Proxy — the libSQL client opens on first query, not at module import.
 * Matters during `next build` where every route module is evaluated to collect
 * page data.
 */
export const db = new Proxy({} as LibSQLDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const real = getDb()
    const value = Reflect.get(real as object, prop, receiver)
    return typeof value === 'function' ? value.bind(real) : value
  },
}) as LibSQLDatabase<typeof schema>

export { schema }

/** Ensure the singleton app_settings row exists. Idempotent. */
export async function ensureDefaultSettings() {
  const existing = await db
    .select({ id: schema.appSettings.id })
    .from(schema.appSettings)
    .limit(1)
  if (existing.length === 0) {
    await db.insert(schema.appSettings).values({
      cityName: 'Cafe Cursor',
      timezone: 'America/Mexico_City',
      language: 'en',
      brandAccent: 'orange',
      onboarded: false,
    })
  }
}
