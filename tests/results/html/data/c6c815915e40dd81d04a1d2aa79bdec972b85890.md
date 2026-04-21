# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-doctor.spec.ts >> Flujo 3: Doctor — agenda y consultas >> 3.11 Doctor NO puede aprobar pagos (endpoint protegido)
- Location: tests/e2e/03-doctor.spec.ts:69:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: 410
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
  3  | test.describe('Flujo 3: Doctor — agenda y consultas', () => {
  4  | 
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await loginAs(page, 'doctor')
  7  |   })
  8  | 
  9  |   test('3.1 Dashboard doctor carga con KPIs del día', async ({ page }) => {
  10 |     await page.goto('/doctor')
  11 |     await expect(page).toHaveURL(/\/doctor/)
  12 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  13 |   })
  14 | 
  15 |   test('3.2 Agenda carga sin error', async ({ page }) => {
  16 |     await page.goto('/doctor/agenda')
  17 |     await page.waitForLoadState('networkidle')
  18 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  19 |   })
  20 | 
  21 |   test('3.3 Pacientes muestra al menos QA paciente', async ({ page }) => {
  22 |     await page.goto('/doctor/patients')
  23 |     await page.waitForLoadState('networkidle')
  24 |     await expect(page.locator('body')).toContainText(/qa.paciente|qa\.patient|paciente|email/i)
  25 |   })
  26 | 
  27 |   test('3.4 Consultas carga', async ({ page }) => {
  28 |     await page.goto('/doctor/consultations')
  29 |     await page.waitForLoadState('networkidle')
  30 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  31 |   })
  32 | 
  33 |   test('3.5 Finanzas del doctor carga', async ({ page }) => {
  34 |     await page.goto('/doctor/finances')
  35 |     await page.waitForLoadState('networkidle')
  36 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  37 |   })
  38 | 
  39 |   test('3.6 Cobros carga', async ({ page }) => {
  40 |     await page.goto('/doctor/cobros')
  41 |     await page.waitForLoadState('networkidle')
  42 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  43 |   })
  44 | 
  45 |   test('3.7 Settings del doctor carga', async ({ page }) => {
  46 |     await page.goto('/doctor/settings')
  47 |     await page.waitForLoadState('networkidle')
  48 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  49 |   })
  50 | 
  51 |   test('3.8 Reportes carga', async ({ page }) => {
  52 |     await page.goto('/doctor/reports')
  53 |     await page.waitForLoadState('networkidle')
  54 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  55 |   })
  56 | 
  57 |   test('3.9 Recordatorios carga', async ({ page }) => {
  58 |     await page.goto('/doctor/reminders')
  59 |     await page.waitForLoadState('networkidle')
  60 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  61 |   })
  62 | 
  63 |   test('3.10 Servicios carga', async ({ page }) => {
  64 |     await page.goto('/doctor/services')
  65 |     await page.waitForLoadState('networkidle')
  66 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  67 |   })
  68 | 
  69 |   test('3.11 Doctor NO puede aprobar pagos (endpoint protegido)', async ({ page }) => {
  70 |     const r = await page.request.post('/api/admin/approve-payment', {
  71 |       data: { paymentId: 'fake-uuid', action: 'approve' },
  72 |     })
> 73 |     expect([401, 403, 404]).toContain(r.status())
     |                             ^ Error: expect(received).toContain(expected) // indexOf
  74 |   })
  75 | })
  76 | 
```