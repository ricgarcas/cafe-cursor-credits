import type { APIRequestContext, Page } from '@playwright/test'

/**
 * Log in as the seed admin (bootstrapped in 01-public-flows.beforeAll) and
 * propagate the cookie to `page`. Admin creation is first-admin-only now;
 * individual tests should reuse the seed admin rather than spawning new ones.
 */
export async function loginAsSeed(request: APIRequestContext, page: Page) {
  const res = await request.post('/api/auth/login', {
    data: { email: 'seed@example.com', password: 'seedseed' },
  })
  if (!res.ok()) throw new Error(`seed login failed: ${await res.text()}`)
  const cookies = (await request.storageState()).cookies
  await page.context().addCookies(cookies)
}

/** Seed coupon codes directly via the admin API. */
export async function seedCodes(request: APIRequestContext, codes: string[]) {
  const res = await request.post('/api/admin/coupons', {
    data: { codes },
  })
  if (!res.ok()) throw new Error(`seedCodes failed: ${await res.text()}`)
  return res.json()
}

/** Complete onboarding with a minimal payload so /admin/* becomes accessible. */
export async function finishOnboarding(
  request: APIRequestContext,
  overrides: Partial<{
    city_name: string
    timezone: string
    language: string
    brand_accent: 'orange' | 'green' | 'violet' | 'blue'
  }> = {},
) {
  const res = await request.put('/api/admin/settings', {
    data: {
      city_name: 'Mexico City',
      country: 'Mexico',
      timezone: 'America/Mexico_City',
      language: 'en',
      brand_accent: 'orange',
      onboarded: true,
      ...overrides,
    },
  })
  if (!res.ok()) throw new Error(`onboarding failed: ${await res.text()}`)
}
