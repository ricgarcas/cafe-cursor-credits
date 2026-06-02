import { test, expect } from '@playwright/test'

test.describe('onboarding wizard UI', () => {
  test('once onboarding is done, sign-in lands on the dashboard', async ({ page }) => {
    // Onboarding is per-deployment, not per-user. The seed admin finished it
    // in 01-public-flows, so any subsequent sign-in should go straight to
    // the dashboard rather than /onboarding.
    await page.goto('/login')
    await page.getByLabel('Email').fill('seed@example.com')
    await page.getByLabel('Password').fill('seedseed')
    await page.getByRole('button', { name: /Sign in/i }).click()

    await expect(page).toHaveURL(/\/admin\/dashboard/)
    await expect(page.getByRole('heading', { name: /Dashboard/ })).toBeVisible()
  })
})
