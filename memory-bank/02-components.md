# 02 — Components

> Inventario de módulos backend, páginas frontend y schemas compartidos.
> Actualizar al crear cualquier módulo, página o schema Zod.

## Páginas frontend (Next.js App Router) — existentes

### `/admin` (super admin)

dashboard, doctors, patients, subscriptions, plans, plan-features, promotions,
packages, reminders, roles, settings, suggestions, finances/finanzas,
approvals/aprobaciones. (Algunas marcadas para eliminar en beta — ver CLAUDE.md raíz.)

### `/doctor`

dashboard, agenda, patients, consultations, ehr, finances, billing, cobros,
reports, crm, reminders, messages, services, plans, offices, templates,
cita-360, suggestions, settings (+ settings/consultation-blocks).

### `/patient`

dashboard, appointments, reports, prescriptions, messages, profile, seguimiento,
login, register, [patientId].

### Público / auth

`/book/[doctorId]` (booking acordeón 5 pasos), `/login`, `/register`,
`/onboarding`, `/auth/callback`, `/forgot-password`, `/reset-password`,
`/privacy`, `/terms`, `/help`, `/status`.

## Rutas API existentes (64) — a migrar a NestJS

Agrupadas: `api/admin/*` (33 — doctors, subscriptions, payments, plans, invoices,
promotions, settings, seed/reset), `api/doctor/*` (22 — appointments, consultations
+transcribe, schedule, payments, billing, reschedule, ai, subscription, calendar-sync,
share-pdf, send-email), `api/book`, `api/cron/subscription-expiry`,
`api/integrations/google/*`, `api/plans`, `api/public/pricing`, `api/promotions`,
`api/onboarding`, `api/suggestions`, `api/seed-accounts`, `api/debug-booking`.

> Lógica de negocio actualmente en route handlers (`app/api/**/route.ts`), no en
> Server Actions. Cada handler hace queries directas a Supabase. La migración los
> reescribe como controllers NestJS → use cases → repositorios Sequelize.

## Módulos backend NestJS (a construir — orden de `migracion/modulos/`)

01 auth · 02 patients · 03 appointments · 04 consultations · 05 ehr-prescriptions ·
06 finances · 07 packages-booking · 08 admin · 09 doctor-settings · 10 patient-portal.

Estado: **ninguno implementado aún** (Fase 3 no iniciada).

## Schemas Zod (`libs/shared-types`) — Fase 2 ✅ (base)

zod 4.4.3. Creados: `enums.ts` (6 enums), `common.ts` (ApiResponse/PaginatedResponse/
ApiErrorResponse/Result + uuid/timestamps), schemas de 7 entidades núcleo (profile,
patient, appointment, consultation, subscription, prescription, ehr-record) con campos
PHI marcados, + DTOs (create-patient, create-appointment, update-appointment-status,
create-consultation). Cada schema exporta `XxxSchema`, `Xxx` (z.infer), `CreateXxxSchema`,
`CreateXxx`. Campos en snake_case (espejan columnas BD). `nx build shared-types` ✓.
Pendiente (crecen por módulo): finance, packages, plans, notifications.

## Enums compartidos

- `AppointmentStatus`: scheduled | confirmed | cancelled | completed | no_show
- `PaymentStatus`: pending | approved
- `SubscriptionStatus`: trial | active | past_due | suspended
- `UserRole`: super_admin | doctor | patient
- `PackageStatus`: active | completed

## Feature flags (tabla `plan_features`)

dashboard, agenda, patients, consultations, ehr, finances, billing, reports, crm,
reminders, messages, invitations, settings. El sidebar del doctor los lee para
mostrar/ocultar módulos (status válidos: active, trial, trialing).
