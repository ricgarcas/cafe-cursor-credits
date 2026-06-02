#!/usr/bin/env node
/**
 * Capture marketing screenshots of the running app into docs/screenshots/.
 * Assumes the app is already running (npm run dev) and the DB is seeded
 * (npm run db:seed). Logs in as the demo admin via the API, then snaps both
 * admin and public pages.
 *
 *   npm run dev          # terminal 1
 *   npm run db:seed      # once
 *   node scripts/screenshots.mjs [baseURL]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:3000'
const OUT = resolve(process.cwd(), 'docs/screenshots')
const ADMIN = { email: 'admin@cafecursor.dev', password: 'cafecursor' }

const ADMIN_SHOTS = [
  ['/admin/dashboard', 'dashboard'],
  ['/admin/attendees', 'attendees'],
  ['/admin/coupons', 'coupons'],
  ['/admin/qr-cards', 'qr-cards'],
  ['/admin/settings', 'settings'],
]
const PUBLIC_SHOTS = [
  ['/register', 'register'],
  ['/claim', 'claim'],
  ['/login', 'login'],
]

async function snap(page, path, name) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700) // let fonts + dot-grid settle
  await page.screenshot({ path: resolve(OUT, `${name}.png`) })
  console.log(`  ✓ ${name}.png  (${path})`)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // retina-crisp for README
    colorScheme: 'dark',
  })

  // Log in via API and reuse the cookie.
  const res = await ctx.request.post(`${BASE}/api/auth/login`, { data: ADMIN })
  if (!res.ok()) {
    console.error(`✗ login failed (${res.status()}). Did you run \`npm run db:seed\`?`)
    console.error(await res.text())
    process.exit(1)
  }

  const page = await ctx.newPage()
  console.log('· admin pages (dark)…')
  for (const [path, name] of ADMIN_SHOTS) await snap(page, path, name)

  console.log('· public pages (dark)…')
  for (const [path, name] of PUBLIC_SHOTS) await snap(page, path, name)

  await browser.close()
  console.log(`\n  Done → docs/screenshots/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
