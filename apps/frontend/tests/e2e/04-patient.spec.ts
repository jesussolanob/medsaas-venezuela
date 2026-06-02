import { test, expect, loginAs } from './fixtures'

test.describe('Flujo 4: Paciente — portal personal', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'patient')
  })

  test('4.1 Dashboard paciente carga', async ({ page }) => {
    await page.goto('/patient/dashboard')
    await expect(page).toHaveURL(/\/patient/)
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('4.2 Citas del paciente cargan', async ({ page }) => {
    await page.goto('/patient/appointments')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('4.3 Perfil del paciente carga', async ({ page }) => {
    await page.goto('/patient/profile')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('4.4 Reportes médicos cargan', async ({ page }) => {
    await page.goto('/patient/reports')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('4.5 Recetas cargan', async ({ page }) => {
    await page.goto('/patient/prescriptions')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('4.6 Mensajes cargan', async ({ page }) => {
    await page.goto('/patient/messages')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('4.7 Paciente NO puede acceder a /admin', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    expect(page.url()).not.toMatch(/\/admin\/?$/)
  })

  test('4.8 Paciente NO puede acceder a /doctor', async ({ page }) => {
    await page.goto('/doctor')
    await page.waitForLoadState('networkidle')
    expect(page.url()).not.toMatch(/\/doctor\/?$/)
  })
})
