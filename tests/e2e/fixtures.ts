import { test as base, expect, Page } from '@playwright/test'

export const QA = {
  admin:   { email: 'qa.admin@delta.test',   password: 'QaAdmin2026!',   role: 'super_admin' },
  doctor:  { email: 'qa.doctor@delta.test',  password: 'QaDoctor2026!',  role: 'doctor'      },
  patient: { email: 'qa.patient@delta.test', password: 'QaPatient2026!', role: 'patient'     },
} as const

export type Role = keyof typeof QA

/**
 * Login con email+password vía la página /login.
 *
 * Selectores REALES detectados en app/login/page.tsx:
 *   - Botón toggle:     "Iniciar con email y contraseña"
 *   - Email input:      input[type="email"] (placeholder "medico@ejemplo.com")
 *   - Password input:   input[type="password"] (placeholder "••••••••")
 *   - Submit button:    "Ingresar"
 */
export async function loginAs(page: Page, role: Role) {
  const u = QA[role]
  await page.goto('/login')
  await page.waitForLoadState('domcontentloaded')

  // 1) Click en el botón "Iniciar con email y contraseña" para mostrar el form
  const toggleBtn = page.getByRole('button', { name: /iniciar con email|continuar con email|usar email/i })
  await toggleBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await toggleBtn.click()

  // 2) Llenar campos
  const emailInput = page.locator('input[type="email"]')
  await emailInput.waitFor({ state: 'visible', timeout: 5_000 })
  await emailInput.fill(u.email)

  const passwordInput = page.locator('input[type="password"]')
  await passwordInput.fill(u.password)

  // 3) Submit (botón "Ingresar")
  await page.getByRole('button', { name: /^ingresar|^iniciar sesi[oó]n|^entrar$/i }).click()

  // 4) Esperar redirect a área correspondiente
  const expectedPath =
    role === 'admin'   ? /\/admin/ :
    role === 'doctor'  ? /\/doctor/ :
                         /\/patient/

  await page.waitForURL(expectedPath, { timeout: 20_000 })
}

export async function logout(page: Page) {
  // Buscar botón "Cerrar sesión" en el sidebar
  const btn = page.getByRole('button', { name: /cerrar sesi[oó]n|salir|logout/i })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    await page.waitForURL(/\/login/, { timeout: 10_000 })
  } else {
    // Fallback: limpiar cookies y reload
    await page.context().clearCookies()
    await page.goto('/login')
  }
}

export const test = base
export { expect }
