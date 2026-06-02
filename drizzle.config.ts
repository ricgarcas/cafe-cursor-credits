import type { Config } from 'drizzle-kit'

/**
 * Works with both local SQLite files and Turso (libSQL).
 *   Local:  DATABASE_URL=file:./data/app.db
 *   Turso:  DATABASE_URL=libsql://xxx.turso.io  +  DATABASE_AUTH_TOKEN=...
 */
const url = process.env.DATABASE_URL ?? 'file:./data/app.db'
const isTurso = url.startsWith('libsql:')

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url,
    authToken: isTurso ? process.env.DATABASE_AUTH_TOKEN : undefined,
  },
  verbose: true,
  strict: true,
} satisfies Config
