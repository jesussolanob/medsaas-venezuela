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

## Módulos backend NestJS (`apps/backend/src/modules/`)

Estado (orden `migracion/modulos/`):

- 01 auth → Etapa 1 cubierto por `DevAuthGuard` (módulo Auth0 real = Fase 4).
- 02 patients → ✅ DDD completo. PII cifrada (full_name/cedula/phone/email) + search hashes;
  /reveal auditado; búsqueda híbrida; soft delete (paranoid). `modules/patients/`.
- 03 appointments → ✅ DDD. Transiciones de estado + `appointment_changes_log`; optimistic
  lock de paquetes. `modules/appointments/`. Diferido: slots/reschedule (falta doctor_schedule).
- 04 consultations → ✅ DDD. Campos clínicos cifrados; `ConsultationCode` VO (DLT-YYYYMM-XXXX,
  retry ante colisión); aprobación de pago. `modules/consultations/`.
- 05 ehr-prescriptions → ✅ DDD. EHR (diagnosis/treatment_plan cifrados) + prescriptions
  (medication/dosage cifrados; anti-IDOR de escritura: valida ownership del paciente).
  `modules/ehr/` + `modules/prescriptions/`. Diferido: PDF + acceso rol-paciente.
- 07 packages-booking → ✅ DDD. Paquetes (ConsumePackageSession optimistic lock vía
  QueryTypes.UPDATE) + booking PÚBLICO (sin auth; find-or-create paciente + cita en transacción
  atómica). `modules/packages/` + `modules/booking/`. Diferido Etapa 2: Turnstile + rate limiting.
- 06 finances → ✅ DDD. Money VO (USD/BS), resumen (consultas aprobadas + transacciones), tasa USDT
  con Redis (TTL 600s), RolesGuard super_admin reutilizable. `modules/finances/`. Migración
  20260602000004 (financial_transactions + app_settings).
- 09 doctor-settings → ✅ DDD. Perfil (payment_details), horario (tabla nueva `doctor_schedules`),
  features (Redis cache resiliente), suscripción (bannerLevel), servicios (pricing_plans CRUD).
  `modules/doctor-settings/`. Diferido: templates (con PDF).
- 10 patient-portal → ✅ DDD. Portal del paciente (dashboard, citas, paquetes, recetas propias,
  mensajes, perfil). Anti-IDOR por `auth_user_id`. `modules/patient-portal/`. Diferido: PDF, reports.
- 08 admin → ⏳ pendiente (ÚLTIMO; depende de todos).

> Nota: `doctor_schedules` ya existe (mig. 000005) → los slots de appointments/booking (antes
> diferidos por falta de esta tabla) ya son implementables si se requieren.

> `RolesGuard` (`presentation/guards/roles.guard.ts`) reutilizable: aplica con `@Roles('super_admin')`
>
> - DevAuthGuard. Fail-closed. Lo usará admin.

> ⚠️ Pitfall DI/webpack: NUNCA declarar `Sequelize` (ni infra global) en el array `providers`
> de un módulo — crashea el server compilado (dist). Inyectarlo del DI global. Verificar con
> boot del dist (`node dist/apps/backend/main.js`), no solo con tests.

**Infraestructura transversal:** `infrastructure/crypto/` (CryptoModule @Global: encrypt/decrypt
AES-256-GCM + HMAC search hash, lee llaves de ConfigService, guard de llaves triviales);
`infrastructure/cache/` (RedisModule ioredis); `infrastructure/auth/` (DevAuthGuard);
`infrastructure/database/` (migraciones .cjs, config Sequelize). Cifrado SIEMPRE en la capa
repositorio (el dominio opera en plaintext). Endpoints: ver `04-api-documentation.md`.

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
