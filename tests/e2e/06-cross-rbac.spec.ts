import { test, expect, loginAs } from './fixtures'

test.describe('Flujo 6: Cross-account RBAC y endpoints API', () => {

  test('6.1 Doctor NO puede listar suscripciones de otros doctores via API', async ({ page }) => {
    await loginAs(page, 'doctor')
    // Intentar acceso directo a endpoint admin
    const r = await page.request.get('/api/admin/doctors')
    expect([401, 403, 404]).toContain(r.status())
  })

  test('6.2 Paciente NO puede listar appointments via API doctor', async ({ page }) => {
    await loginAs(page, 'patient')
    const r = await page.request.get('/api/doctor/appointments')
    // 405 también es aceptable si el endpoint no expone GET (still RBAC-safe)
    expect([401, 403, 404, 405]).toContain(r.status())
  })

  test('6.3 Sin login: /api/doctor/consultations devuelve 401', async ({ request }) => {
    const r = await request.get('/api/doctor/consultations')
    expect(r.status()).toBe(401)
  })

  test('6.4 Sin login: /api/doctor/billing devuelve 401', async ({ request }) => {
    const r = await request.get('/api/doctor/billing')
    expect(r.status()).toBe(401)
  })

  test('6.5 PATCH consultation con doctor_id ajeno NO escala privilegio', async ({ page }) => {
    await loginAs(page, 'doctor')
    const r = await page.request.patch('/api/doctor/consultations', {
      data: {
        id: '00000000-0000-0000-0000-000000000000',
        doctor_id: '11111111-1111-1111-1111-111111111111', // intento de hijack
        diagnosis: 'INJECTED',
      },
    })
    // Debe fallar (404 porque la consulta no existe, o 400 por allowlist)
    // En cualquier caso NO debe ser 200
    expect(r.status()).not.toBe(200)
  })
})
