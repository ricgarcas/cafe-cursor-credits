import { test, expect, type APIRequestContext } from '@playwright/test'
import { seedCodes, finishOnboarding } from './helpers'

async function hasSessionCookie(api: APIRequestContext) {
  const { cookies } = await api.storageState()
  return cookies.some((c) => c.name === 'cc_session')
}

test.describe('public flows', () => {
  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3100',
    })
    // Bootstrap: create an admin so we can seed codes via the admin API.
    const reg = await api.post('/api/admin-register', {
      data: {
        name: 'Ada',
        email: 'seed@example.com',
        password: 'seedseed',
      },
    })
    // Follow up with an explicit login — ensures the session cookie is on the
    // APIRequestContext jar regardless of whether admin-register already
    // existed or the Set-Cookie from register didn't propagate.
    if (!reg.ok() || !(await hasSessionCookie(api))) {
      const login = await api.post('/api/auth/login', {
        data: { email: 'seed@example.com', password: 'seedseed' },
      })
      if (!login.ok()) throw new Error(`seed login failed: ${await login.text()}`)
    }
    await finishOnboarding(api)
    await seedCodes(api, ['CC-PUB-001', 'CC-PUB-002', 'CC-PUB-003'])
    await api.dispose()
  })

  test('root redirects to /register', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/register$/)
    await expect(page.getByRole('heading', { name: /Cafe Cursor/ })).toBeVisible()
  })

  test('register form shows success', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Full name').fill('Alan Turing')
    await page.getByLabel('Email').fill(`alan-${Date.now()}@example.com`)
    await page.getByRole('button', { name: /Register/ }).click()
    await expect(page.getByText(/You're in|registered/i)).toBeVisible({ timeout: 10_000 })
  })

  test('claim shows the code on screen', async ({ page }) => {
    await page.goto('/claim')
    await page.getByLabel('Full name').fill('Grace Hopper')
    await page.getByLabel('Email').fill(`grace-${Date.now()}@example.com`)
    await page.getByRole('button', { name: /Show my code/i }).click()
    await expect(page.getByText('Your Cursor credit code')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/CC-PUB-/)).toBeVisible()
    await expect(page.getByRole('link', { name: /Redeem/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible()
  })

  test('claim is idempotent for the same email', async ({ page, request }) => {
    const email = `twice-${Date.now()}@example.com`
    const first = await request.post('/api/claim', {
      data: { name: 'Twice', email },
    })
    const firstBody = await first.json()
    expect(firstBody.code).toBeTruthy()

    const second = await request.post('/api/claim', {
      data: { name: 'Twice', email },
    })
    const secondBody = await second.json()
    expect(secondBody.alreadyClaimed).toBe(true)
    expect(secondBody.code).toBe(firstBody.code)
  })

  test('register rejects duplicate emails', async ({ request }) => {
    const email = `dup-${Date.now()}@example.com`
    const first = await request.post('/api/register', { data: { name: 'Dup', email } })
    expect(first.ok()).toBe(true)
    const second = await request.post('/api/register', { data: { name: 'Dup', email } })
    expect(second.status()).toBe(400)
    const body = await second.json()
    expect(body.error).toMatch(/already registered/i)
  })
})
