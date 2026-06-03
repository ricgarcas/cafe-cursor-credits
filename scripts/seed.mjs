#!/usr/bin/env node
/**
 * Seed the local SQLite DB with realistic demo data so the admin dashboard,
 * attendees table, coupon inventory and QR cards all look alive.
 *
 *   npm run db:seed
 *
 * Wipes attendees / coupon_codes / luma_* and the demo admin, then reinserts.
 * Settings are configured + onboarded so you land straight on the dashboard.
 * Dev convenience only — never run against production data.
 */
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import { resolve } from 'node:path'

const RAW = process.env.DATABASE_URL ?? 'file:./data/app.db'
const url = RAW.startsWith('file:') || RAW.startsWith('libsql:') ? RAW : `file:${RAW}`
const db = createClient({
  url,
  authToken: url.startsWith('libsql:') ? process.env.DATABASE_AUTH_TOKEN : undefined,
})

const ADMIN = { name: 'Ambassador', email: 'admin@cafecursor.dev', password: 'cafecursor' }

// CDMX-flavored bilingual mix.
const FIRST = [
  'Sofía', 'Mateo', 'Valentina', 'Diego', 'Camila', 'Santiago', 'Regina', 'Emiliano',
  'Ximena', 'Sebastián', 'Renata', 'Leonardo', 'María José', 'Daniel', 'Frida', 'Andrés',
  'Lucía', 'Gabriel', 'Paula', 'Iker', 'Romina', 'Ángel', 'Ana', 'Bruno', 'Carla',
  'Javier', 'Daniela', 'Rodrigo', 'Mariana', 'Alex', 'Priya', 'Liang', 'Noah', 'Aisha',
  'Tomás', 'Elena', 'Hugo', 'Isabella', 'Marco', 'Nora',
]
const LAST = [
  'García', 'Hernández', 'Martínez', 'López', 'González', 'Rodríguez', 'Pérez', 'Sánchez',
  'Ramírez', 'Flores', 'Torres', 'Vázquez', 'Reyes', 'Morales', 'Cruz', 'Ortiz',
  'Gutiérrez', 'Chávez', 'Ramos', 'Mendoza', 'Castillo', 'Romero', 'Álvarez', 'Núñez',
]

const SOURCES = ['website', 'website', 'website', 'manual', 'luma', 'luma']
// NFD splits accents into combining marks; the final [^a-z] filter drops them.
const slug = (s) => s.normalize('NFD').toLowerCase().replace(/[^a-z]/g, '')

// Deterministic-ish: walk arrays with coprime steps, no RNG needed.
function makeAttendees(n) {
  const out = []
  const seen = new Set()
  for (let i = 0; i < n; i++) {
    const first = FIRST[(i * 7) % FIRST.length]
    const last = LAST[(i * 5) % LAST.length]
    const name = `${first} ${last}`
    let email = `${slug(first)}.${slug(last)}@gmail.com`
    if (seen.has(email)) email = `${slug(first)}.${slug(last)}${i}@gmail.com`
    seen.add(email)
    const daysAgo = (i * 3) % 28
    const hour = 9 + (i % 11)
    const d = new Date(Date.now() - daysAgo * 86400000)
    const ts = `${d.toISOString().slice(0, 10)} ${String(hour).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}:00`
    out.push({ name, email, source: SOURCES[i % SOURCES.length], registeredAt: ts })
  }
  return out
}

// Real Cursor referral codes look like `CFNHNHRUGX1Q` — 12 uppercase
// alphanumerics, no separators. The app wraps them into a cursor.com URL.
function makeCodes(n) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const codes = new Set()
  while (codes.size < n) {
    let code = ''
    for (let j = 0; j < 12; j++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
    codes.add(code)
  }
  return [...codes]
}

async function main() {
  // Fail early with a friendly hint if the schema isn't there yet.
  try {
    await db.execute('SELECT 1 FROM app_settings LIMIT 1')
  } catch {
    console.error('✗ Tables missing. Run `npm run db:push` first, then re-run seed.')
    process.exit(1)
  }

  console.log('· clearing demo data…')
  await db.batch(
    [
      'DELETE FROM attendees',
      'DELETE FROM coupon_codes',
      'DELETE FROM luma_guests',
      'DELETE FROM luma_events',
      `DELETE FROM users WHERE email = '${ADMIN.email}'`,
    ],
    'write',
  )

  // --- settings (singleton, configured + onboarded) ---
  const settings = await db.execute('SELECT id FROM app_settings LIMIT 1')
  const settingsValues = {
    cityName: 'CDMX',
    country: 'Mexico',
    timezone: 'America/Mexico_City',
    language: 'es',
    brandAccent: 'orange',
    eventTagline: 'Build the future, one prompt at a time.',
    onboarded: 1,
    emailProvider: 'resend',
  }
  if (settings.rows.length === 0) {
    await db.execute({
      sql: `INSERT INTO app_settings (city_name, country, timezone, language, brand_accent, event_tagline, onboarded, email_provider)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: Object.values(settingsValues),
    })
  } else {
    await db.execute({
      sql: `UPDATE app_settings SET city_name=?, country=?, timezone=?, language=?, brand_accent=?, event_tagline=?, onboarded=?, email_provider=? WHERE id=?`,
      args: [...Object.values(settingsValues), settings.rows[0].id],
    })
  }

  // --- admin user ---
  const hash = await bcrypt.hash(ADMIN.password, 10)
  await db.execute({
    sql: 'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)',
    args: [ADMIN.email, ADMIN.name, hash],
  })

  // --- attendees, with ~60% holding an assigned (used) coupon ---
  const attendees = makeAttendees(42)

  // --- coupon codes ---
  // Leave exactly AVAILABLE_CODES unused so the QR-cards preview can fill
  // whole pages (36 → 4 pages of 9).
  const AVAILABLE_CODES = 36
  const willUse = attendees.filter((_, i) => i % 5 !== 0).length
  const codes = makeCodes(willUse + AVAILABLE_CODES)
  await db.batch(
    codes.map((code) => ({
      sql: 'INSERT INTO coupon_codes (code) VALUES (?)',
      args: [code],
    })),
    'write',
  )
  const codeRows = (await db.execute('SELECT id FROM coupon_codes ORDER BY id')).rows
  let codeCursor = 0
  for (let i = 0; i < attendees.length; i++) {
    const a = attendees[i]
    let couponId = null
    if (i % 5 !== 0 && codeCursor < codeRows.length) {
      couponId = codeRows[codeCursor].id
      codeCursor++
      await db.execute({
        sql: `UPDATE coupon_codes SET is_used=1, used_at=?, used_by_type='attendee' WHERE id=?`,
        args: [a.registeredAt, couponId],
      })
    }
    await db.execute({
      sql: `INSERT INTO attendees (name, email, coupon_code_id, source, registered_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [a.name, a.email, couponId, a.source, a.registeredAt],
    })
  }

  const usedCount = codeCursor
  console.log('')
  console.log('  ✓ Seeded demo data:')
  console.log(`     · 1 admin    → ${ADMIN.email} / ${ADMIN.password}`)
  console.log(`     · ${attendees.length} attendees`)
  console.log(`     · ${codes.length} coupon codes (${usedCount} assigned, ${codes.length - usedCount} available)`)
  console.log(`     · city: Cafe Cursor ${settingsValues.cityName} (onboarded)`)
  console.log('')
  console.log('  Restart `npm run dev`, open /login and sign in with the admin above.')
  console.log('')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
