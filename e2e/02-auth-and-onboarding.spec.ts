import { test, expect } from '@playwright/test'

test.describe('auth + onboarding gate', () => {
  test('unauthenticated /admin/dashboard redirects to /login', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /Sign in/ })).toBeVisible()
  })

  test('unauthenticated /onboarding redirects to /login', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login with bad credentials shows error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('nope@example.com')
    await page.getByLabel('Password').fill('wrongwrong')
    await page.getByRole('button', { name: /Sign in/i }).click()
    await expect(page.getByText(/Invalid credentials/i)).toBeVisible()
  })

  test('admin login + logout round trip', async ({ page }) => {
    // Sign in via the UI using the seed admin bootstrapped in 01-public-flows.
    await page.goto('/login')
    await page.getByLabel('Email').fill('seed@example.com')
    await page.getByLabel('Password').fill('seedseed')
    await page.getByRole('button', { name: /Sign in/i }).click()
    await expect(page).toHaveURL(/\/admin\/dashboard|\/onboarding/)

    // Log out via the API (simpler than clicking through the sidebar menu).
    const logout = await page.request.post('/api/auth/logout')
    expect(logout.ok()).toBe(true)

    // Now /admin/dashboard should bounce to login again.
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})
