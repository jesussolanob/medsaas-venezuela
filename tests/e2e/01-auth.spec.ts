import { test, expect, loginAs, logout, QA } from './fixtures'

test.describe('Flujo 1: Autenticación y RBAC', () => {

  test('1.1 Login admin → /admin', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(/\/admin/)
    // El layout admin debe mostrar "Super Admin" o nav típico
    await expect(page.locator('body')).toContainText(/admin|dashboard|m[ée]dicos/i)
  })

  test('1.2 Login doctor → /doctor', async ({ page }) => {
    await loginAs(page, 'doctor')
    await expect(page).toHaveURL(/\/doctor/)
    await expect(page.locator('body')).toContainText(/agenda|pacientes|consultas/i)
  })

  test('1.3 Login paciente → /patient', async ({ page }) => {
    await loginAs(page, 'patient')
    await expect(page).toHaveURL(/\/patient/)
  })

  test('1.4 Login con credenciales inválidas falla', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    const toggleBtn = page.getByRole('button', { name: /iniciar con email|continuar con email/i })
    await toggleBtn.click()
    await page.locator('input[type="email"]').fill('noexiste@delta.test')
    await page.locator('input[type="password"]').fill('wrongpass123')
    await page.getByRole('button', { name: /^ingresar|^iniciar sesi[oó]n|^entrar$/i }).click()
    // Debe mostrar error y NO redirigir
    await page.waitForTimeout(3000)
    await expect(page).toHaveURL(/\/login/)
  })

  test('1.5 RBAC: paciente NO accede a /admin', async ({ page }) => {
    await loginAs(page, 'patient')
    await page.goto('/admin')
    // Debe redirigir fuera de /admin
    await page.waitForLoadState('networkidle')
    expect(page.url()).not.toMatch(/\/admin\/?$/)
  })

  test('1.6 RBAC: doctor NO accede a /admin', async ({ page }) => {
    await loginAs(page, 'doctor')
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    expect(page.url()).not.toMatch(/\/admin\/?$/)
  })

  test('1.7 RBAC: paciente NO accede a /doctor', async ({ page }) => {
    await loginAs(page, 'patient')
    await page.goto('/doctor')
    await page.waitForLoadState('networkidle')
    expect(page.url()).not.toMatch(/\/doctor\/?$/)
  })

  test('1.8 Logout limpia sesión', async ({ page }) => {
    await loginAs(page, 'admin')
    await logout(page)
    // Acceso a /admin sin login debe redirigir a /login
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('1.9 Sin login: /admin y /doctor redirigen a /login', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

    await page.goto('/doctor')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

    await page.goto('/patient/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})
