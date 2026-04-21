# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-admin.spec.ts >> Flujo 2: Admin — gestión global >> 2.1 Dashboard admin carga sin error
- Location: tests/e2e/02-admin.spec.ts:9:7

# Error details

```
Error: expect(locator).not.toContainText(expected) failed

Locator: locator('main, body')
Expected pattern: not /error|undefined/i
Error: strict mode violation: locator('main, body') resolved to 2 elements:
    1) <body class="min-h-full flex flex-col">…</body> aka locator('body')
    2) <main class="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 w-full">…</main> aka getByRole('main')

Call log:
  - Expect "not toContainText" with timeout 5000ms
  - waiting for locator('main, body')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - img [ref=e6]
          - generic [ref=e10]:
            - paragraph [ref=e11]: Delta.
            - paragraph [ref=e12]: Super Admin
        - button "Ocultar sidebar" [ref=e13]:
          - img [ref=e14]
      - navigation [ref=e17]:
        - link "Dashboard" [ref=e18] [cursor=pointer]:
          - /url: /admin
          - img [ref=e19]
          - text: Dashboard
        - link "Médicos" [ref=e24] [cursor=pointer]:
          - /url: /admin/doctors
          - img [ref=e25]
          - text: Médicos
        - link "Aprobaciones" [ref=e30] [cursor=pointer]:
          - /url: /admin/approvals
          - img [ref=e31]
          - text: Aprobaciones
        - link "Finanzas" [ref=e34] [cursor=pointer]:
          - /url: /admin/finances
          - img [ref=e35]
          - text: Finanzas
        - link "Sugerencias" [ref=e37] [cursor=pointer]:
          - /url: /admin/suggestions
          - img [ref=e38]
          - text: Sugerencias
        - link "Configuración" [ref=e40] [cursor=pointer]:
          - /url: /admin/settings
          - img [ref=e41]
          - text: Configuración
      - generic [ref=e44]:
        - generic [ref=e48]: Sistema operativo
        - button "Cerrar sesión" [ref=e49]:
          - img [ref=e50]
          - text: Cerrar sesión
    - generic [ref=e53]:
      - banner [ref=e54]:
        - heading "Dashboard" [level=1] [ref=e56]
        - generic [ref=e57]:
          - button "Buscar módulo... ⌘K" [ref=e58]:
            - img [ref=e59]
            - generic [ref=e62]: Buscar módulo...
            - generic [ref=e63]: ⌘K
          - button [ref=e65]:
            - img [ref=e66]
      - main [ref=e69]:
        - generic [ref=e71]:
          - generic [ref=e72]:
            - img [ref=e73]
            - generic [ref=e76]:
              - paragraph [ref=e77]: martes, 21 de abril de 2026
              - heading "Buenos días, Delta." [level=1] [ref=e78]
              - paragraph [ref=e79]: Sin aprobaciones pendientes, 5 especialistas nuevos este mes y +100% de crecimiento MoM.
              - generic [ref=e80]:
                - link "Revisar aprobaciones →" [ref=e81] [cursor=pointer]:
                  - /url: /admin/approvals
                - link "Ver especialistas" [ref=e82] [cursor=pointer]:
                  - /url: /admin/doctors
          - generic [ref=e83]:
            - generic [ref=e84]:
              - generic [ref=e85]:
                - generic [ref=e86]: Especialistas activos
                - generic [ref=e88]: 👤
              - paragraph [ref=e89]: "5"
              - paragraph [ref=e90]: +5 este mes
            - generic [ref=e91]:
              - generic [ref=e92]:
                - generic [ref=e93]: Consultas hoy
                - generic [ref=e95]: 📅
              - paragraph [ref=e96]: "1"
              - paragraph [ref=e97]: Tiempo real
            - generic [ref=e98]:
              - generic [ref=e99]:
                - generic [ref=e100]: Consultas este mes
                - generic [ref=e102]: ❤️
              - paragraph [ref=e103]: "5"
              - paragraph [ref=e104]: +100% vs. mes anterior
            - generic [ref=e105]:
              - generic [ref=e106]:
                - generic [ref=e107]: Suscripciones activas
                - generic [ref=e109]: 📋
              - paragraph [ref=e110]: "5"
              - paragraph [ref=e111]: 0 en trial
          - generic [ref=e112]:
            - generic [ref=e113]:
              - generic [ref=e114]:
                - generic [ref=e115]:
                  - paragraph [ref=e116]: Suscripciones · últimos 6 meses
                  - paragraph [ref=e117]: Crecimiento de la plataforma
                - generic [ref=e118]: ↑ +100%
              - paragraph [ref=e120]: Cargando datos...
            - generic [ref=e121]:
              - paragraph [ref=e123]: Aprobaciones pendientes
              - paragraph [ref=e125]: No hay aprobaciones pendientes
          - generic [ref=e126]:
            - generic [ref=e127]:
              - generic [ref=e128]: Crecimiento MoM
              - paragraph [ref=e129]: +100%
              - paragraph [ref=e130]: Vs. mes anterior
              - paragraph [ref=e131]: 5 nuevas suscripciónes
            - generic [ref=e132]:
              - generic [ref=e133]: Total especialistas
              - paragraph [ref=e134]: "5"
              - paragraph [ref=e135]: Registrados en la plataforma
              - link "Ver listado completo →" [ref=e136] [cursor=pointer]:
                - /url: /admin/doctors
            - generic [ref=e137]:
              - generic [ref=e138]: Consultas totales (mes)
              - paragraph [ref=e139]: "5"
              - paragraph [ref=e140]: Appointments + Consultas directas
              - link "Ver finanzas →" [ref=e141] [cursor=pointer]:
                - /url: /admin/finances
  - alert [ref=e142]
```

# Test source

```ts
  1  | import { test, expect, loginAs } from './fixtures'
  2  | 
  3  | test.describe('Flujo 2: Admin — gestión global', () => {
  4  | 
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await loginAs(page, 'admin')
  7  |   })
  8  | 
  9  |   test('2.1 Dashboard admin carga sin error', async ({ page }) => {
  10 |     await page.goto('/admin')
  11 |     await expect(page).toHaveURL(/\/admin/)
> 12 |     await expect(page.locator('main, body')).not.toContainText(/error|undefined/i)
     |                                                  ^ Error: expect(locator).not.toContainText(expected) failed
  13 |   })
  14 | 
  15 |   test('2.2 Lista de doctores carga', async ({ page }) => {
  16 |     await page.goto('/admin/doctors')
  17 |     await expect(page).toHaveURL(/\/admin\/doctors/)
  18 |     // Debe haber al menos 1 doctor (el QA + reales)
  19 |     await expect(page.locator('body')).toContainText(/qa\.doctor@delta\.test|m[ée]dico|email/i)
  20 |   })
  21 | 
  22 |   test('2.3 Página de planes muestra los 4 planes', async ({ page }) => {
  23 |     await page.goto('/admin/plans')
  24 |     await page.waitForLoadState('networkidle')
  25 |     await expect(page.locator('body')).toContainText(/trial/i)
  26 |     await expect(page.locator('body')).toContainText(/b[áa]sico|basic/i)
  27 |     await expect(page.locator('body')).toContainText(/profesional|professional/i)
  28 |     await expect(page.locator('body')).toContainText(/cl[íi]nica/i)
  29 |   })
  30 | 
  31 |   test('2.4 Página de aprobaciones carga', async ({ page }) => {
  32 |     await page.goto('/admin/approvals')
  33 |     await page.waitForLoadState('networkidle')
  34 |     // No debe lanzar errores aunque no haya pagos pendientes
  35 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  36 |   })
  37 | 
  38 |   test('2.5 Finanzas carga', async ({ page }) => {
  39 |     await page.goto('/admin/finances')
  40 |     await page.waitForLoadState('networkidle')
  41 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  42 |   })
  43 | 
  44 |   test('2.6 Settings carga', async ({ page }) => {
  45 |     await page.goto('/admin/settings')
  46 |     await page.waitForLoadState('networkidle')
  47 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  48 |   })
  49 | 
  50 |   test('2.7 Suscripciones carga', async ({ page }) => {
  51 |     await page.goto('/admin/subscriptions')
  52 |     await page.waitForLoadState('networkidle')
  53 |     await expect(page.locator('body')).not.toContainText(/error|undefined/i)
  54 |   })
  55 | 
  56 |   test('2.8 Endpoint /api/admin/seed devuelve 404 en producción', async ({ page }) => {
  57 |     const r = await page.request.post('/api/admin/seed')
  58 |     // En producción debe ser 404. En dev puede ser 401/403 o 200.
  59 |     expect([401, 403, 404]).toContain(r.status())
  60 |   })
  61 | 
  62 |   test('2.9 Endpoint /api/seed-accounts devuelve 404 en producción', async ({ page }) => {
  63 |     const r = await page.request.get('/api/seed-accounts')
  64 |     expect([401, 403, 404]).toContain(r.status())
  65 |   })
  66 | 
  67 |   test('2.10 Endpoint /api/admin/reset-database devuelve 404 en producción', async ({ page }) => {
  68 |     const r = await page.request.post('/api/admin/reset-database')
  69 |     expect([400, 401, 403, 404]).toContain(r.status())
  70 |   })
  71 | })
  72 | 
```