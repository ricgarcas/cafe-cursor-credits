// Upgrades pre-event deployments: creates events/event_attendees, backfills
// participation rows from legacy attendee columns, then drops the legacy
// columns so db:push doesn't have to. Safe to run on every boot.
import { createClient } from '@libsql/client'

const RAW = process.env.DATABASE_URL ?? 'file:./data/app.db'
const url = RAW.startsWith('file:') || RAW.startsWith('libsql:') ? RAW : `file:${RAW}`
const db = createClient({ url, authToken: url.startsWith('libsql:') ? process.env.DATABASE_AUTH_TOKEN : undefined })

async function hasTable(name) {
  const r = await db.execute({ sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, args: [name] })
  return r.rows.length > 0
}
async function hasColumn(table, col) {
  const r = await db.execute(`PRAGMA table_info(${table})`)
  return r.rows.some((row) => row.name === col)
}
async function dropColumnIfExists(table, col) {
  if (await hasColumn(table, col)) await db.execute(`ALTER TABLE ${table} DROP COLUMN ${col}`)
}

async function main() {
  if (!(await hasTable('attendees')) || !(await hasColumn('attendees', 'coupon_code_id'))) {
    console.log('migrate-events: nothing to do')
    return
  }
  console.log('migrate-events: upgrading legacy deployment…')

  await db.execute(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    event_date TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    claim_passcode TEXT,
    luma_event_api_id TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  )`)
  await db.execute(`CREATE TABLE IF NOT EXISTS event_attendees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'website',
    registered_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    coupon_code_id INTEGER REFERENCES coupon_codes(id) ON DELETE SET NULL,
    luma_guest_id TEXT,
    checked_in_at TEXT,
    email_status TEXT,
    email_error TEXT,
    email_sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  )`)
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS event_attendees_event_attendee_unique ON event_attendees(event_id, attendee_id)`,
  )

  // One default event from the city name, active.
  const existing = await db.execute(`SELECT id FROM events LIMIT 1`)
  let eventId
  if (existing.rows.length > 0) {
    eventId = existing.rows[0].id
  } else {
    const s = await db.execute(`SELECT city_name FROM app_settings LIMIT 1`)
    const city = s.rows[0]?.city_name ?? 'Cafe Cursor'
    const name = String(city).startsWith('Cafe Cursor') ? city : `Cafe Cursor ${city}`
    const ins = await db.execute({ sql: `INSERT INTO events (name, status) VALUES (?, 'active')`, args: [name] })
    eventId = Number(ins.lastInsertRowid)
  }

  // Backfill one participation per legacy attendee, carrying coupon + source +
  // luma linkage and the luma email-sent flag. Idempotent via the unique index.
  await db.execute({
    sql: `INSERT OR IGNORE INTO event_attendees
            (event_id, attendee_id, source, registered_at, coupon_code_id, luma_guest_id, email_sent_at, email_status)
          SELECT ?, a.id, a.source, a.registered_at, a.coupon_code_id, a.luma_guest_id, lg.email_sent_at,
                 CASE WHEN lg.email_sent_at IS NOT NULL THEN 'sent' ELSE NULL END
          FROM attendees a
          LEFT JOIN luma_guests lg ON lg.api_id = a.luma_guest_id`,
    args: [eventId],
  })

  for (const col of ['coupon_code_id', 'source', 'luma_guest_id', 'luma_event_id', 'registered_at']) {
    await dropColumnIfExists('attendees', col)
  }
  await dropColumnIfExists('coupon_codes', 'used_by_type')
  await dropColumnIfExists('app_settings', 'luma_event_id')
  console.log('migrate-events: done')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
