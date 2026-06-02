# Tests E2E — Delta Medical CRM

## Suite de pruebas Playwright

Cubre los 6 flujos críticos del MVP:

| Archivo | Flujo |
|---|---|
| `01-auth.spec.ts` | Login, logout, RBAC entre roles |
| `02-admin.spec.ts` | Dashboard admin, doctores, planes, aprobaciones, finanzas, settings |
| `03-doctor.spec.ts` | Dashboard doctor, agenda, pacientes, consultas, finanzas, recordatorios |
| `04-patient.spec.ts` | Portal paciente: dashboard, citas, perfil, reportes, recetas |
| `05-public-booking.spec.ts` | Booking público sin login + endpoints públicos |
| `06-cross-rbac.spec.ts` | Intentos de escalada de privilegio entre roles |

## Setup inicial (1 vez)

```bash
# 1. Instalar Playwright + browsers
npm install
npx playwright install chromium

# 2. Crear las 3 cuentas QA en Supabase
npm run qa:setup
```

Esto crea en producción (Supabase real):
- `qa.admin@delta.test`   /  `QaAdmin2026!`   (super_admin)
- `qa.doctor@delta.test`  /  `QaDoctor2026!`  (doctor — con agenda + servicios + reminders)
- `qa.patient@delta.test` /  `QaPatient2026!` (paciente — con cita futura)

## Correr los tests

### Contra producción (default cuando se omite E2E_BASE_URL)
```bash
E2E_BASE_URL=https://medsaas-venezuela.vercel.app npm run test:e2e
```

### Contra dev local
```bash
# En una terminal: arrancar Next.js
npm run dev

# En otra: correr los tests
npm run test:e2e
```

### Modo UI interactivo (debug)
```bash
npm run test:e2e:ui
```

### Ver el reporte HTML después
```bash
npm run test:e2e:report
```

## Output

Los resultados quedan en:
- `tests/results/last-run.json` — JSON estructurado (lo lee Claude)
- `tests/results/html/` — reporte navegable
- `tests/results/artifacts/` — screenshots y videos de fallos

## Convención

- Cada test es independiente (no asume estado previo)
- No se usa retry — si falla, falla en el primer intento
- Los assertions priorizan "NO debe contener error" para detectar regresiones blandas
