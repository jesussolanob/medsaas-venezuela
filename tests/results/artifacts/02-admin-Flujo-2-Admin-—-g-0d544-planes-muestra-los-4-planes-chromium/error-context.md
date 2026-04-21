# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-admin.spec.ts >> Flujo 2: Admin — gestión global >> 2.3 Página de planes muestra los 4 planes
- Location: tests/e2e/02-admin.spec.ts:22:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('body')
Expected pattern: /b[áa]sico|basic/i
Received string:  "Delta.Super AdminDashboardMédicosAprobacionesFinanzasSugerenciasConfiguraciónSistema operativoCerrar sesiónAdminBuscar módulo...⌘KBeta PrivadaDelta está actualmente en beta privada. Los médicos se registran y esperan aprobación del admin para acceder al sistema.Plan actualBeta Privada (Gratis)Planes en sistema4 activos / 4 totalConfiguración del BetaAjusta los parámetros del periodo de pruebaActivoDías de trial para nuevos registrosLos médicos tienen este número de días de prueba antes de que su cuenta sea suspendida o aprobada manualmente.Descripción del planAcceso gratuito por 15 díasPrecio (USD)Durante la beta privada el precio es $0. Cámbialo cuando lances los planes de pago.¿Cómo funciona la beta privada?El médico se registra en /register y recibe un periodo trialAparece en Aprobaciones con estado \"Trial\"El admin aprueba y activa su cuenta por 1 añoEl médico accede a todas las funciones sin costo"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('body')
    9 × locator resolved to <body class="min-h-full flex flex-col">…</body>
      - unexpected value "Delta.Super AdminDashboardMédicosAprobacionesFinanzasSugerenciasConfiguraciónSistema operativoCerrar sesiónAdminBuscar módulo...⌘KBeta PrivadaDelta está actualmente en beta privada. Los médicos se registran y esperan aprobación del admin para acceder al sistema.Plan actualBeta Privada (Gratis)Planes en sistema4 activos / 4 totalConfiguración del BetaAjusta los parámetros del periodo de pruebaActivoDías de trial para nuevos registrosLos médicos tienen este número de días de prueba antes de que su cuenta sea suspendida o aprobada manualmente.Descripción del planAcceso gratuito por 15 díasPrecio (USD)Durante la beta privada el precio es $0. Cámbialo cuando lances los planes de pago.¿Cómo funciona la beta privada?El médico se registra en /register y recibe un periodo trialAparece en Aprobaciones con estado "Trial"El admin aprueba y activa su cuenta por 1 añoEl médico accede a todas las funciones sin costo"

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
        - heading "Admin" [level=1] [ref=e56]
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
            - generic [ref=e73]:
              - img [ref=e74]
              - heading "Beta Privada" [level=2] [ref=e76]
            - paragraph [ref=e77]: Delta está actualmente en beta privada. Los médicos se registran y esperan aprobación del admin para acceder al sistema.
          - generic [ref=e78]:
            - generic [ref=e79]:
              - generic [ref=e80]:
                - img [ref=e81]
                - generic [ref=e84]: Plan actual
              - paragraph [ref=e85]: Beta Privada (Gratis)
            - generic [ref=e86]:
              - generic [ref=e87]:
                - img [ref=e88]
                - generic [ref=e93]: Planes en sistema
              - paragraph [ref=e94]: 4 activos / 4 total
          - generic [ref=e95]:
            - generic [ref=e96]:
              - generic [ref=e97]:
                - heading "Configuración del Beta" [level=3] [ref=e98]
                - paragraph [ref=e99]: Ajusta los parámetros del periodo de prueba
              - generic [ref=e100]: Activo
            - generic [ref=e101]:
              - generic [ref=e102]:
                - generic [ref=e103]: Días de trial para nuevos registros
                - spinbutton [ref=e104]: "15"
                - paragraph [ref=e105]: Los médicos tienen este número de días de prueba antes de que su cuenta sea suspendida o aprobada manualmente.
              - generic [ref=e106]:
                - generic [ref=e107]: Descripción del plan
                - textbox "Acceso completo a todas las funciones durante la beta privada..." [ref=e108]: Acceso gratuito por 15 días
              - generic [ref=e109]:
                - generic [ref=e110]: Precio (USD)
                - spinbutton [ref=e111]: "0"
                - paragraph [ref=e112]: Durante la beta privada el precio es $0. Cámbialo cuando lances los planes de pago.
          - generic [ref=e113]:
            - paragraph [ref=e114]: ¿Cómo funciona la beta privada?
            - list [ref=e115]:
              - listitem [ref=e116]: El médico se registra en /register y recibe un periodo trial
              - listitem [ref=e117]: Aparece en Aprobaciones con estado "Trial"
              - listitem [ref=e118]: El admin aprueba y activa su cuenta por 1 año
              - listitem [ref=e119]: El médico accede a todas las funciones sin costo
  - alert [ref=e120]
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
  12 |     await expect(page.locator('main, body')).not.toContainText(/error|undefined/i)
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
> 26 |     await expect(page.locator('body')).toContainText(/b[áa]sico|basic/i)
     |                                        ^ Error: expect(locator).toContainText(expected) failed
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