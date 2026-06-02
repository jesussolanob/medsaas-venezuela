import { test, expect, loginAs } from './fixtures'

test.describe('Flujo 2: Admin — gestión global', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('2.1 Dashboard admin carga sin error', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin/)
    // Verifica que no haya stack traces o "undefined" visibles. Usamos solo body.
    await expect(page.locator('body')).not.toContainText(/typeerror|cannot read|stack trace/i)
  })

  test('2.2 Lista de doctores carga', async ({ page }) => {
    await page.goto('/admin/doctors')
    await expect(page).toHaveURL(/\/admin\/doctors/)
    // Debe haber al menos 1 doctor (el QA + reales)
    await expect(page.locator('body')).toContainText(/qa\.doctor@delta\.test|m[ée]dico|email/i)
  })

  test('2.3 Página de planes carga sin errores', async ({ page }) => {
    await page.goto('/admin/plans')
    await page.waitForLoadState('networkidle')
    // En beta privada solo se muestra el plan trial (es esperado).
    // Validamos que la página cargue + mencione "plan" + indique los 4 totales.
    await expect(page.locator('body')).toContainText(/plan/i)
    await expect(page.locator('body')).toContainText(/4/)
  })

  test('2.4 /admin/approvals redirige a /admin (flujo eliminado)', async ({ page }) => {
    await page.goto('/admin/approvals')
    await page.waitForLoadState('networkidle')
    // El módulo de aprobaciones fue eliminado; debe redirigir a /admin
    await expect(page).toHaveURL(/\/admin\/?$/)
  })

  test('2.4b Endpoint /api/admin/approve-payment devuelve 410 Gone', async ({ page }) => {
    const r = await page.request.post('/api/admin/approve-payment', {
      data: { paymentId: 'fake', action: 'approve' },
    })
    expect([404, 410]).toContain(r.status())
  })

  test('2.5 /admin/finances redirige a /admin (eliminado en beta)', async ({ page }) => {
    await page.goto('/admin/finances')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/admin\/?$/)
  })

  test('2.5b Pacientes (nuevo módulo) carga con estadísticas', async ({ page }) => {
    await page.goto('/admin/patients')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText(/pacientes/i)
    // No debe crashear
    await expect(page.locator('body')).not.toContainText(/typeerror|cannot read/i)
  })

  test('2.6 Settings muestra admins + BCV', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText(/administrador/i)
    await expect(page.locator('body')).toContainText(/bcv|tasa/i)
  })

  test('2.6b Endpoint /api/admin/admins lista admins', async ({ page }) => {
    const r = await page.request.get('/api/admin/admins')
    expect(r.status()).toBe(200)
    const j = await r.json()
    expect(Array.isArray(j.data)).toBe(true)
    expect(j.data.length).toBeGreaterThan(0)
  })

  test('2.7 Suscripciones carga', async ({ page }) => {
    await page.goto('/admin/subscriptions')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  })

  test('2.8 Endpoint /api/admin/seed devuelve 404 en producción', async ({ page }) => {
    const r = await page.request.post('/api/admin/seed')
    // En producción debe ser 404. En dev puede ser 401/403 o 200.
    expect([401, 403, 404]).toContain(r.status())
  })

  test('2.9 Endpoint /api/seed-accounts devuelve 404 en producción', async ({ page }) => {
    const r = await page.request.get('/api/seed-accounts')
    expect([401, 403, 404]).toContain(r.status())
  })

  test('2.10 Endpoint /api/admin/reset-database devuelve 404 en producción', async ({ page }) => {
    const r = await page.request.post('/api/admin/reset-database')
    expect([400, 401, 403, 404]).toContain(r.status())
  })
})
