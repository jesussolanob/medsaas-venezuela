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

### Migración del frontend (en curso — eliminar Supabase, conectar al backend)

- **Fundación ✅** (`lib/api-client.server.ts` BFF, `lib/dev-auth.ts` stub, `proxy.ts` middleware Next 16)
  - piloto **patients** (`app/doctor/patients/actions.ts` thin-proxy, cero @supabase). E2E verificado.
- **ÁREA DOCTOR ✅** auth de Supabase ELIMINADA de los 17 .tsx del doctor (usan dev-stub `getDoctorId`);
  `app/doctor/actions.ts` + `app/doctor/services/actions.ts` nuevos; services con CRUD completo al backend;
  ehr/consultations cableados. tsc 0. Data residual → Fase 5 (ver progress-log).
- **Patrón:** reescribir el cuerpo de cada `actions.ts`/route handler → llamar al backend vía BFF,
  quitando `@supabase/*`; UI (.tsx) intacta. Auth = dev-stub (x-dev-\*) → Auth0 Fase 4.
- **ÁREA PATIENT (portal) ✅** auth Supabase eliminada de layout/dashboard/appointments/profile
  (usan dev-stub + `app/patient/actions.ts` thin-proxy a /api/patient/\*); `DEV_PATIENT_UUID` añadido.
  Diferido Fase 5 (sin endpoint, con TODO en cada archivo): `reports`, `seguimiento` (shared_files/
  realtime/storage), `[patientId]` y `[patientId]/report` (exposición clínica = decisión de producto).
  GAP backend detectado: appointments del paciente no traen doctorName/specialty/meetLink; perfil solo
  persiste address/city/notes; sin contador de informes. tsc 0.
- **ADMIN auth ✅ + LOGIN dev-stub ✅** admin logout y login sin Supabase (cookies dev por rol inferido
  del email; `DEV_ADMIN_UUID` …0003). Google OAuth → "próximamente" (Fase 4).
- **Pendiente / bloqueado (frontend):**
  - **admin DATA pages**: backend solo tiene lecturas + 3 PUT; faltan endpoints (finanzas, payments,
    invoices, promotions, packages, reminders, roles, plan-edit, createDoctor=Auth0) + ~32 route handlers
    `app/api/admin/*` que usan Supabase → sub-proyecto Fase 4/5.
  - **booking público**: tiene backend (info/plans/packages/POST) pero el client embebe signup (Fase 4) +
    storage receipts (Fase 5) + route handler `/api/book` → trabajo dedicado.
  - **auth-recovery** (register, auth/callback, forgot/reset-password, onboarding) → Fase 4 (Auth0).
  - Barrido final: borrar `lib/supabase/*` cuando nada de datos lo use.
- **Diferido Fase 5** (sin endpoint backend aún): IA/Gemini, email/Resend, PDF, storage→GCS, calendar, cron.
- UI a CONSERVAR: 104 `.tsx` (Next.js 16 + Tailwind teal/slate). 0 componentes cliente usan Supabase.

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
- 08 admin → ✅ DDD. super_admin: dashboard KPIs, médicos+actividad, suscripciones, planes/features
  (toggle), stats, settings. Todos con @Roles('super_admin')+RolesGuard. `modules/admin/`.

**🎉 Módulos base del backend (10/10).** 614 tests verdes; dist boota sin colisión.

### Grupo A — APIs nuevas (paridad con proyecto original, desde 2026-06-03)

- 11 **payments (consultation_payments)** → ✅ DDD. Tabla `consultation_payments` (mig. 20260603000000).
  Sistema SECUNDARIO: lo usa solo `consultations/page.tsx` (registrar pago al cerrar consulta).
  `modules/payments/`, rutas `/api/doctor/payments`. 61 tests.
- 12 **finanzas-pagos (payments + payment_items)** → ✅ DDD, EN el módulo `finances`
  (mig. 20260603000001). Sistema PRINCIPAL = fuente de verdad financiera (`lib/finances.ts`).
  Tablas `payments` (amount_usd/bs, bcv_rate, status pending|approved, paid_at, package_id) +
  `payment_items` (line-items) + `appointments.payment_id` FK. Rutas `/api/finances/payments`:
  GET lista (joins appointment+consultation), GET /totals (KPIs), PUT :id/status (sync
  consultations.payment_status), GET/POST/DELETE :id/items (recalcula total + sync appointment.plan_price).
  Anti-IDOR, transacciones, sin PII de patients cifrados. **Integrado en booking** (CreateBooking crea el
  payment + enlaza appointment.payment_id). 227 tests dirigidos + 732 suite; dist bootea; curl real 200.
  Storage de comprobante + realtime + PDF de recibo → Fase 5.
  **Frontend cableado ✅ (commit e0f30c4):** `app/doctor/finances/payments-actions.ts` (BFF) +
  `cobros/page.tsx` y `finances/page.tsx` migrados (lista, estado, items). `lib/finances.ts` ya NO
  usa Supabase (solo tipos + formatters). Residual Supabase en esas pantallas (Fase 5): storage de
  comprobantes, realtime, PDF de recibo, lectura de pricing_plans (add-item modal), export Excel,
  y gastos `financial_transactions` (usar /api/finances/transactions más adelante). tsc 0.

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
