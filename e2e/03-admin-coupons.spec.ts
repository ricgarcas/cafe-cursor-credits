import { test, expect } from '@playwright/test'
import { loginAsSeed } from './helpers'

test.describe('admin: coupon inventory end-to-end', () => {
  test('bulk add codes, see them on dashboard, claim one', async ({ page, request }) => {
    await loginAsSeed(request, page)

    // Add codes via the Coupons page.
    await page.goto('/admin/coupons')
    await page.getByRole('button', { name: /Bulk add/i }).click()
    await page.getByPlaceholder(/AAAA-BBBB-CCCC/).fill('E2E-ONE\nE2E-TWO\nE2E-THREE')
    await page.getByRole('button', { name: /Add codes/i }).click()
    await expect(page.getByText(/Added 3|3.*duplicates/i)).toBeVisible({ timeout: 5_000 })

    // Dashboard should reflect the new inventory.
    await page.goto('/admin/dashboard')
    await expect(page.getByText('Credits remaining')).toBeVisible()
    await expect(page.getByText(/Registrations/i)).toBeVisible()

    // Claim one of the new codes via the public page.
    const claim = await request.post('/api/claim', {
      data: { name: 'E2E Claimer', email: `claimer-${Date.now()}@example.com` },
    })
    const body = await claim.json()
    expect(body.code).toMatch(/^(E2E|CC)-/)
  })
})
