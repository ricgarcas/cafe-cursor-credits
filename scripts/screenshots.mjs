/**
 * Regenerates docs/screenshots/*.png against a running dev server.
 *
 *   npm run dev            # or: PORT=3001 npm run dev
 *   node scripts/screenshots.mjs --base http://localhost:3001
 *
 * Reproducible on purpose: the README's images drift every time the visual
 * identity changes, and hand-captured shots come back at different sizes and
 * themes. Everything here is one width, one theme, one pass.
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}

const BASE = (arg('base', 'http://localhost:3001')).replace(/\/+$/, '')
const EMAIL = arg('email', 'admin@cafecursor.dev')
const PASSWORD = arg('password', 'TestPass123!')
const OUT = resolve(process.cwd(), 'docs/screenshots')
const SIZE = { width: 1440, height: 900 }

mkdirSync(OUT, { recursive: true })

/** Admin pages. Captured signed in, sidebar expanded. */
const ADMIN = [
  ['dashboard', '/admin/dashboard'],
  ['attendees', '/admin/attendees'],
  ['coupons', '/admin/coupons'],
  ['qr-cards', '/admin/qr-cards'],
  ['mcp-guide', '/admin/guide'],
  ['settings', '/admin/settings'],
]

/** Public pages. No session. */
const PUBLIC = [
  ['register', '/register'],
  ['claim', '/claim'],
  ['login', '/login'],
  ['docs-cursor', '/docs/cursor'],
]

/** Pages whose point is the whole document, not the first fold. */
const FULL_PAGE = new Set(['mcp-guide'])

const shot = async (page, name, opts = {}) => {
  // Let fonts settle and any entry animation finish before capturing.
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts })
  console.log(`  ✓ ${name}.png`)
}

const browser = await chromium.launch()

try {
  console.log(`Capturing from ${BASE}\n`)

  // ---- Public, no session ----
  const anon = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 2 })
  const p1 = await anon.newPage()
  console.log('Public pages:')
  for (const [name, path] of PUBLIC) {
    await p1.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await shot(p1, name)
  }

  // The OAuth consent screen needs a registered client, so make one the same
  // way Cursor does — via dynamic client registration.
  console.log('\nOAuth consent:')
  const reg = await p1.request.post(`${BASE}/oauth/register`, {
    data: {
      client_name: 'Cursor',
      redirect_uris: ['http://127.0.0.1:51000/callback'],
    },
  })
  const { client_id } = await reg.json()
  const consentQuery = new URLSearchParams({
    response_type: 'code',
    client_id,
    redirect_uri: 'http://127.0.0.1:51000/callback',
    // Any valid S256 challenge works; the screen never evaluates it.
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
    scope: 'cafecursor:read cafecursor:write',
    state: 'screenshot',
  }).toString()
  await anon.close()

  // ---- Signed in ----
  const auth = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 2 })
  const page = await auth.newPage()
  // Login is rate limited per IP, and re-running this script trips it. Post
  // directly so the status code is visible, and back off on a 429 rather than
  // failing with an opaque navigation timeout.
  for (let attempt = 1; ; attempt++) {
    const res = await page.request.post(`${BASE}/api/auth/login`, {
      data: { email: EMAIL, password: PASSWORD },
    })
    if (res.ok()) {
      const body = await res.json()
      if (body.must_change_password) {
        throw new Error(
          `${EMAIL} must set a password before screenshots can be taken. ` +
            `Log in once in a browser, choose one, then re-run.`,
        )
      }
      break
    }
    if (res.status() === 429 && attempt <= 4) {
      console.log(`  … login rate limited, waiting 30s (attempt ${attempt}/4)`)
      await page.waitForTimeout(30_000)
      continue
    }
    throw new Error(
      `Login failed for ${EMAIL} (HTTP ${res.status()}). ` +
        `Pass --email/--password if this deployment uses different credentials.`,
    )
  }

  // Consent needs the session, so it lands in the signed-in pass.
  await page.goto(`${BASE}/oauth/authorize?${consentQuery}`, {
    waitUntil: 'domcontentloaded',
  })
  await shot(page, 'oauth-consent', { fullPage: true })

  console.log('\nAdmin pages:')
  for (const [name, path] of ADMIN) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    if (name === 'settings') {
      // Land on Connections rather than the default General tab.
      await page.getByRole('button', { name: 'Connections' }).click().catch(() => {})
      await page.waitForTimeout(300)
    }
    await shot(page, name, FULL_PAGE.has(name) ? { fullPage: true } : {})
  }

  await auth.close()
  console.log(`\nDone — ${OUT}`)
} finally {
  await browser.close()
}
