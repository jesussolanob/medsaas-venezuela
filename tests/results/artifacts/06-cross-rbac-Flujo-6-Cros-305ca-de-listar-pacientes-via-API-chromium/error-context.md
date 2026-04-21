# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 06-cross-rbac.spec.ts >> Flujo 6: Cross-account RBAC y endpoints API >> 6.2 Paciente NO puede listar pacientes via API
- Location: tests/e2e/06-cross-rbac.spec.ts:12:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: 405
Received array: [401, 403]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e4]:
    - img [ref=e6]
    - paragraph [ref=e10]: Cargando...
```

# Test source

```ts
  1  | import { test, expect, loginAs } from './fixtures'
  2  | 
  3  | test.describe('Flujo 6: Cross-account RBAC y endpoints API', () => {
  4  | 
  5  |   test('6.1 Doctor NO puede listar suscripciones de otros doctores via API', async ({ page }) => {
  6  |     await loginAs(page, 'doctor')
  7  |     // Intentar acceso directo a endpoint admin
  8  |     const r = await page.request.get('/api/admin/doctors')
  9  |     expect([401, 403, 404]).toContain(r.status())
  10 |   })
  11 | 
  12 |   test('6.2 Paciente NO puede listar pacientes via API', async ({ page }) => {
  13 |     await loginAs(page, 'patient')
  14 |     const r = await page.request.get('/api/doctor/appointments')
> 15 |     expect([401, 403]).toContain(r.status())
     |                        ^ Error: expect(received).toContain(expected) // indexOf
  16 |   })
  17 | 
  18 |   test('6.3 Sin login: /api/doctor/consultations devuelve 401', async ({ request }) => {
  19 |     const r = await request.get('/api/doctor/consultations')
  20 |     expect(r.status()).toBe(401)
  21 |   })
  22 | 
  23 |   test('6.4 Sin login: /api/doctor/billing devuelve 401', async ({ request }) => {
  24 |     const r = await request.get('/api/doctor/billing')
  25 |     expect(r.status()).toBe(401)
  26 |   })
  27 | 
  28 |   test('6.5 PATCH consultation con doctor_id ajeno NO escala privilegio', async ({ page }) => {
  29 |     await loginAs(page, 'doctor')
  30 |     const r = await page.request.patch('/api/doctor/consultations', {
  31 |       data: {
  32 |         id: '00000000-0000-0000-0000-000000000000',
  33 |         doctor_id: '11111111-1111-1111-1111-111111111111', // intento de hijack
  34 |         diagnosis: 'INJECTED',
  35 |       },
  36 |     })
  37 |     // Debe fallar (404 porque la consulta no existe, o 400 por allowlist)
  38 |     // En cualquier caso NO debe ser 200
  39 |     expect(r.status()).not.toBe(200)
  40 |   })
  41 | })
  42 | 
```