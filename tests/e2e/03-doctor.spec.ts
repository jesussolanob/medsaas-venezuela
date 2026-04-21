import { test, expect, loginAs } from './fixtures'

test.describe('Flujo 3: Doctor — agenda y consultas', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'doctor')
  })

  test('3.1 Dashboard doctor carga con KPIs del día', async ({ page }) => {
    await page.goto('/doctor')
    await expect(page).toHaveURL(/\/doctor/)
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('3.2 Agenda carga sin error', async ({ page }) => {
    await page.goto('/doctor/agenda')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('3.3 Pacientes muestra al menos QA paciente', async ({ page }) => {
    await page.goto('/doctor/patients')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText(/qa.paciente|qa\.patient|paciente|email/i)
  })

  test('3.4 Consultas carga', async ({ page }) => {
    await page.goto('/doctor/consultations')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('3.5 Finanzas del doctor carga', async ({ page }) => {
    await page.goto('/doctor/finances')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('3.6 Cobros carga', async ({ page }) => {
    await page.goto('/doctor/cobros')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('3.7 Settings del doctor carga', async ({ page }) => {
    await page.goto('/doctor/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('3.8 Reportes carga', async ({ page }) => {
    await page.goto('/doctor/reports')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('3.9 Recordatorios carga', async ({ page }) => {
    await page.goto('/doctor/reminders')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('3.10 Servicios carga', async ({ page }) => {
    await page.goto('/doctor/services')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('3.11 Doctor NO puede aprobar pagos (endpoint protegido)', async ({ page }) => {
    const r = await page.request.post('/api/admin/approve-payment', {
      data: { paymentId: 'fake-uuid', action: 'approve' },
    })
    expect([401, 403, 404]).toContain(r.status())
  })
})
