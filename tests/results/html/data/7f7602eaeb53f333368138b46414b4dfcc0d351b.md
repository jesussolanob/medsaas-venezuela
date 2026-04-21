# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 06-cross-rbac.spec.ts >> Flujo 6: Cross-account RBAC y endpoints API >> 6.1 Doctor NO puede listar suscripciones de otros doctores via API
- Location: tests/e2e/06-cross-rbac.spec.ts:5:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: 200
Received array: [401, 403, 404]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - img [ref=e7]
          - generic [ref=e11]:
            - paragraph [ref=e12]: Delta.
            - paragraph [ref=e13]: Especialista
        - button "Ocultar sidebar" [ref=e14]:
          - img [ref=e15]
      - navigation [ref=e18]:
        - generic [ref=e19]:
          - link "Inicio" [ref=e20] [cursor=pointer]:
            - /url: /doctor
            - img [ref=e21]
            - text: Inicio
          - link "Agenda" [ref=e26] [cursor=pointer]:
            - /url: /doctor/agenda
            - img [ref=e27]
            - text: Agenda
        - generic [ref=e29]:
          - button "Consultorio" [ref=e30]:
            - generic [ref=e31]:
              - img [ref=e32]
              - text: Consultorio
            - img [ref=e36]
          - generic [ref=e38]:
            - link "Pacientes" [ref=e39] [cursor=pointer]:
              - /url: /doctor/patients
              - img [ref=e40]
              - text: Pacientes
            - link "Consultas" [ref=e45] [cursor=pointer]:
              - /url: /doctor/consultations
              - img [ref=e46]
              - text: Consultas
            - link "Consultorios" [ref=e49] [cursor=pointer]:
              - /url: /doctor/offices
              - img [ref=e50]
              - text: Consultorios
            - link "Plantillas" [ref=e54] [cursor=pointer]:
              - /url: /doctor/templates
              - img [ref=e55]
              - text: Plantillas
        - generic [ref=e59]:
          - button "Finanzas" [ref=e60]:
            - generic [ref=e61]:
              - img [ref=e62]
              - text: Finanzas
            - img [ref=e64]
          - generic [ref=e66]:
            - link "Finanzas" [ref=e67] [cursor=pointer]:
              - /url: /doctor/finances
              - img [ref=e68]
              - text: Finanzas
            - link "Cobros" [ref=e71] [cursor=pointer]:
              - /url: /doctor/cobros
              - img [ref=e72]
              - text: Cobros
            - link "Servicios" [ref=e75] [cursor=pointer]:
              - /url: /doctor/services
              - img [ref=e76]
              - text: Servicios
        - generic [ref=e80]:
          - button "Marketing" [ref=e81]:
            - generic [ref=e82]:
              - img [ref=e83]
              - text: Marketing
            - img [ref=e86]
          - link "Recordatorios" [ref=e89] [cursor=pointer]:
            - /url: /doctor/reminders
            - img [ref=e90]
            - text: Recordatorios
      - generic [ref=e93]:
        - generic [ref=e94]:
          - generic [ref=e95]:
            - img [ref=e96]
            - paragraph [ref=e99]: Beta Privada
          - paragraph [ref=e100]: Acceso completo
        - link "Sugerencias" [ref=e101] [cursor=pointer]:
          - /url: /doctor/suggestions
          - img [ref=e102]
          - text: Sugerencias
        - link "Configuración" [ref=e104] [cursor=pointer]:
          - /url: /doctor/settings
          - img [ref=e105]
          - text: Configuración
        - button "Cerrar sesión" [ref=e108]:
          - img [ref=e109]
          - text: Cerrar sesión
    - generic [ref=e112]:
      - banner [ref=e113]:
        - heading "Inicio" [level=1] [ref=e115]
        - generic [ref=e116]:
          - button "Buscar... ⌘K" [ref=e117]:
            - img [ref=e118]
            - generic [ref=e121]: Buscar...
            - generic [ref=e122]: ⌘K
          - img [ref=e124] [cursor=pointer]
      - main [ref=e127]:
        - generic [ref=e130]:
          - img [ref=e131]
          - generic [ref=e134]: Cargando tu portal...
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
> 9  |     expect([401, 403, 404]).toContain(r.status())
     |                             ^ Error: expect(received).toContain(expected) // indexOf
  10 |   })
  11 | 
  12 |   test('6.2 Paciente NO puede listar pacientes via API', async ({ page }) => {
  13 |     await loginAs(page, 'patient')
  14 |     const r = await page.request.get('/api/doctor/appointments')
  15 |     expect([401, 403]).toContain(r.status())
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