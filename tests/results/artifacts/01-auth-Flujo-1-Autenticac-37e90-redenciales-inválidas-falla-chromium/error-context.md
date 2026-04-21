# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-auth.spec.ts >> Flujo 1: Autenticación y RBAC >> 1.4 Login con credenciales inválidas falla
- Location: tests/e2e/01-auth.spec.ts:23:7

# Error details

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for getByPlaceholder(/email|correo/i)

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - img [ref=e4]
      - generic [ref=e8]:
        - img [ref=e9]
        - generic [ref=e12]:
          - paragraph [ref=e13]: Delta.
          - paragraph [ref=e14]: Health Tech
        - generic [ref=e15]: Beta Privada
      - generic [ref=e16]:
        - paragraph [ref=e17]: Beta privada · Acceso completo
        - heading "Tu especialista, a un lazo de distancia." [level=1] [ref=e18]:
          - text: Tu especialista,
          - text: a un lazo de
          - text: distancia.
        - paragraph [ref=e19]: Gestiona pacientes, agenda, historial clínico y finanzas desde un solo lugar.
        - generic [ref=e20]:
          - generic [ref=e21]:
            - paragraph [ref=e22]: 500+
            - paragraph [ref=e23]: Especialistas
          - generic [ref=e24]:
            - paragraph [ref=e25]: "12"
            - paragraph [ref=e26]: Especialidades
          - generic [ref=e27]:
            - paragraph [ref=e28]: 24/7
            - paragraph [ref=e29]: Disponibilidad
      - generic [ref=e30]:
        - generic [ref=e31]:
          - paragraph [ref=e32]: “Delta transformó mi consulta. Ahora tengo todo bajo control y mis pacientes están más satisfechos.”
          - generic [ref=e33]:
            - generic [ref=e34]: CM
            - generic [ref=e35]:
              - paragraph [ref=e36]: Dr. Carlos Méndez
              - paragraph [ref=e37]: Cardiólogo · Caracas
        - generic [ref=e38]:
          - generic [ref=e39]:
            - img [ref=e40]
            - text: Pronto en App Store
          - generic [ref=e42]:
            - img [ref=e43]
            - text: Pronto en Google Play
          - generic [ref=e45]: Próximamente planes disponibles
    - generic [ref=e47]:
      - generic [ref=e48]:
        - generic [ref=e49]:
          - generic [ref=e50]: Beta Privada
          - heading "Bienvenido a Delta" [level=2] [ref=e52]
          - paragraph [ref=e53]: Inicia sesión o crea tu cuenta
        - button "Continuar con Google" [ref=e54]:
          - img [ref=e55]
          - text: Continuar con Google
        - generic [ref=e62]: o
        - button "Iniciar con email y contraseña" [ref=e64]:
          - img [ref=e65]
          - text: Iniciar con email y contraseña
        - generic [ref=e68]:
          - generic [ref=e69]: Especialistas
          - generic [ref=e70]: Pacientes
          - generic [ref=e71]: Admin
        - paragraph [ref=e72]: Si es tu primera vez con Google, se creará tu cuenta automáticamente.
      - paragraph [ref=e73]:
        - link "← Volver al inicio" [ref=e74] [cursor=pointer]:
          - /url: /
  - alert [ref=e75]
```

# Test source

```ts
  1  | import { test, expect, loginAs, logout, QA } from './fixtures'
  2  | 
  3  | test.describe('Flujo 1: Autenticación y RBAC', () => {
  4  | 
  5  |   test('1.1 Login admin → /admin', async ({ page }) => {
  6  |     await loginAs(page, 'admin')
  7  |     await expect(page).toHaveURL(/\/admin/)
  8  |     // El layout admin debe mostrar "Super Admin" o nav típico
  9  |     await expect(page.locator('body')).toContainText(/admin|dashboard|m[ée]dicos/i)
  10 |   })
  11 | 
  12 |   test('1.2 Login doctor → /doctor', async ({ page }) => {
  13 |     await loginAs(page, 'doctor')
  14 |     await expect(page).toHaveURL(/\/doctor/)
  15 |     await expect(page.locator('body')).toContainText(/agenda|pacientes|consultas/i)
  16 |   })
  17 | 
  18 |   test('1.3 Login paciente → /patient', async ({ page }) => {
  19 |     await loginAs(page, 'patient')
  20 |     await expect(page).toHaveURL(/\/patient/)
  21 |   })
  22 | 
  23 |   test('1.4 Login con credenciales inválidas falla', async ({ page }) => {
  24 |     await page.goto('/login')
  25 |     const emailToggle = page.getByRole('button', { name: /continuar con email|usar email/i })
  26 |     if (await emailToggle.isVisible().catch(() => false)) await emailToggle.click()
> 27 |     await page.getByPlaceholder(/email|correo/i).fill('noexiste@delta.test')
     |                                                  ^ TimeoutError: locator.fill: Timeout 15000ms exceeded.
  28 |     await page.getByPlaceholder(/contraseña|password/i).fill('wrongpass123')
  29 |     await page.getByRole('button', { name: /iniciar sesión|entrar|login/i }).click()
  30 |     // Debe mostrar error y NO redirigir
  31 |     await page.waitForTimeout(2000)
  32 |     await expect(page).toHaveURL(/\/login/)
  33 |   })
  34 | 
  35 |   test('1.5 RBAC: paciente NO accede a /admin', async ({ page }) => {
  36 |     await loginAs(page, 'patient')
  37 |     await page.goto('/admin')
  38 |     // Debe redirigir fuera de /admin
  39 |     await page.waitForLoadState('networkidle')
  40 |     expect(page.url()).not.toMatch(/\/admin\/?$/)
  41 |   })
  42 | 
  43 |   test('1.6 RBAC: doctor NO accede a /admin', async ({ page }) => {
  44 |     await loginAs(page, 'doctor')
  45 |     await page.goto('/admin')
  46 |     await page.waitForLoadState('networkidle')
  47 |     expect(page.url()).not.toMatch(/\/admin\/?$/)
  48 |   })
  49 | 
  50 |   test('1.7 RBAC: paciente NO accede a /doctor', async ({ page }) => {
  51 |     await loginAs(page, 'patient')
  52 |     await page.goto('/doctor')
  53 |     await page.waitForLoadState('networkidle')
  54 |     expect(page.url()).not.toMatch(/\/doctor\/?$/)
  55 |   })
  56 | 
  57 |   test('1.8 Logout limpia sesión', async ({ page }) => {
  58 |     await loginAs(page, 'admin')
  59 |     await logout(page)
  60 |     // Acceso a /admin sin login debe redirigir a /login
  61 |     await page.goto('/admin')
  62 |     await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  63 |   })
  64 | 
  65 |   test('1.9 Sin login: /admin y /doctor redirigen a /login', async ({ page }) => {
  66 |     await page.context().clearCookies()
  67 |     await page.goto('/admin')
  68 |     await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  69 | 
  70 |     await page.goto('/doctor')
  71 |     await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  72 | 
  73 |     await page.goto('/patient/dashboard')
  74 |     await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  75 |   })
  76 | })
  77 | 
```