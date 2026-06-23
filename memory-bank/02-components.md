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

> Originalmente la lógica vivía en route handlers (`app/api/**/route.ts`) con
> queries directas a Supabase. La migración los reescribió como controllers
> NestJS → use cases → repositorios Sequelize; el frontend ahora solo proxya
> al backend vía BFF (`lib/api-client.server.ts`).

### Migración del frontend (✅ Supabase eliminado — cableado al backend)

> **Estado 2026-06:** Supabase eliminado por completo (0 imports). Auth0
> integrado env-gated (dev-stub sigue por defecto en local). Email/Resend y
> storage MinIO/GCS operativos. Pendiente real: IA/Gemini (re-cableo), PDF de
> recibos/informes, Google Calendar sync y cron de recordatorios. El historial
> granular por fase de abajo se conserva como bitácora.

- **Fundación ✅** (`lib/api-client.server.ts` BFF, `lib/dev-auth.ts` stub, `proxy.ts` middleware Next 16)
  - piloto **patients** (`app/doctor/patients/actions.ts` thin-proxy, cero @supabase). E2E verificado.
- **ÁREA DOCTOR ✅** auth de Supabase ELIMINADA de los 17 .tsx del doctor (usan dev-stub `getDoctorId`);
  `app/doctor/actions.ts` + `app/doctor/services/actions.ts` nuevos; services con CRUD completo al backend;
  ehr/consultations cableados. tsc 0. Data residual → Fase 5 (ver progress-log).
- **Patrón:** reescribir el cuerpo de cada `actions.ts`/route handler → llamar al backend vía BFF,
  quitando `@supabase/*`; UI (.tsx) intacta. Auth = dev-stub (x-dev-\*) por defecto;
  Auth0 ✅ integrado (env-gated por `AUTH_MODE`).
- **ÁREA PATIENT (portal) ✅** auth Supabase eliminada de layout/dashboard/appointments/profile
  (usan dev-stub + `app/patient/actions.ts` thin-proxy a /api/patient/\*); `DEV_PATIENT_UUID` añadido.
  Diferido Fase 5 (sin endpoint, con TODO en cada archivo): `reports`, `seguimiento` (shared_files/
  realtime/storage), `[patientId]` y `[patientId]/report` (exposición clínica = decisión de producto).
  GAP backend detectado: appointments del paciente no traen doctorName/specialty/meetLink; perfil solo
  persiste address/city/notes; sin contador de informes. tsc 0.
- **ADMIN auth ✅ + LOGIN dev-stub ✅** admin logout y login sin Supabase (cookies dev por rol inferido
  del email; `DEV_ADMIN_UUID` …0003). Google OAuth → "próximamente" (Fase 4).
- **Pendiente / bloqueado (frontend):**
  - ~~**admin DATA pages**~~ → ✅ HECHO. Grupo A admin-config cableó finanzas, payments, invoices,
    promotions, roles/capabilities, plan-edit, app-settings. `createDoctor` usa Auth0 (✅ integrado).
  - **booking público**: backend OK (info/plans/packages/POST); el client aún embebe signup +
    PDF/recibo. Storage de receipts ✅ disponible (MinIO/GCS).
  - **auth-recovery** (register, auth/callback, forgot/reset-password, onboarding) → vía Auth0
    (✅ integrado env-gated; falta cablear las pantallas de recovery al flujo Auth0).
- **Diferido** (aún sin cablear): IA/Gemini, PDF, Google Calendar sync, cron de
  recordatorios. (Email/Resend y storage MinIO/GCS ✅ ya integrados.)
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

**Admin ampliado (2026-06-22 — 4 features nuevas de "todo configurable"):**

- **Bloquear/desbloquear acceso de doctor** (`PUT /api/admin/doctors/:id/access`): ban duro de cuenta independiente de verificación/suscripción. Reusa `profiles.is_active`, enforcement en `AppAuthGuard` (403 `ACCOUNT_BLOCKED` para no-super_admin si is_active=false). Endpoint acepta `{is_active, reason?}`. No bloquea super_admin (anti-lockout). Frontend: botón en `/admin/verifications` + pantalla global de bloqueo + logout.
- **Especialidades UI (`GET /api/admin/specialties`)**: lista todas (activas+inactivas). Frontend: página `/admin/specialties` (crear/editar/activar) + sidebar. Antes solo POST/PUT (sin GET).
- **App-settings genéricos (`GET/PUT /api/admin/settings`)**: editor key/value. Filtra secretos, upsert de cualquier key. Las keys de tasas en solo-lectura.
- **Editor de plantillas de email (`GET/PUT /api/admin/email-templates/:name`)**: lista, obtén (subject+html+text), edita. SIN crear/borra (set fijo de 9 plantillas reales: `appointment_confirmed`, `doctor_pending_verification`, `invoice`, `payment_approved`, `reminder_24h`, `reminder_3h`, `reminder_7d`, `shared_documents_code`, `welcome`). Preview en iframe sandbox. Variables {{..}} visibles. Cubre recordatorios + todo el correo.

**Diagnóstico: tabla `email_send_log`** (migración `20260622000000-add-email-send-log`). Registra cada correo SIN PII: `recipient_type` ('patient'|'doctor'|'admin'|'system'), `recipient_id` (uuid, NO email), `template_name`, `status` (sent|failed), `provider` (resend|noop|sandbox), `provider_message_id`, `error_detail`, `created_at`. Fuente: `MailerService.sendTemplate()` (7 callers). Para diagnóstico/auditoría post-mortem.

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
  usa Supabase (solo tipos + formatters). Pendiente en esas pantallas: PDF de recibo, realtime
  (sin reemplazo aún — decisión de producto), export Excel, y gastos `financial_transactions`
  (usar /api/finances/transactions más adelante). Storage de comprobantes ✅ disponible (MinIO/GCS). tsc 0.
- 13 **billing** → ✅ DDD. Módulo `modules/billing/`. Mig. `20260603000002-billing.cjs`. 4 tablas nuevas:
  `subscription_payments` (pago de suscripción de la plataforma, workflow pending→approved/rejected),
  `invoices` (facturas admin→doctor, número FAC-YYYYMMDD-XXXX), `billing_documents` (documentos fiscales
  del doctor, número por tipo), `subscription_changes_log` (audit log inmutable). 8 use cases.
  Rutas: `/api/admin/subscription-payments` (GET/approve/reject) · `/api/admin/invoices` (POST/GET/paid) ·
  `/api/doctor/billing` (GET/POST). Anti-IDOR: doctorId de user.sub. approveSubscriptionPayment TRANSACCIONAL
  (payment+subscriptions+profiles+log). ProfileAdminModel + AdminSubscriptionModel reutilizados (forFeature).
  128 suites / 799 tests verdes; dist bootea 8 rutas sin crash DI. Diferido Fase 5: email, PDF.
  Reemplaza legacy: `app/api/admin/payments/*` · `app/api/admin/invoices/` · `app/api/admin/mark-invoice-paid`
  - `app/api/doctor/billing` · `lib/subscription.ts` (extendSubscription/logSubscriptionChange).

- 14 **leads (CRM)** → ✅ DDD (commit a6256d8). Tabla `leads` (ya existía). `modules/leads/`. Rutas
  `/api/doctor/leads` GET/POST, `/:id` PUT/DELETE, `/:id/stage` PUT. Stages new|contacted|qualified|
  appointment|converted|lost. Anti-IDOR. 62 tests, boot+curl 200. Reemplaza `app/doctor/crm`.
- 15 **suggestions** → ✅ DDD (commit e504d7c, mig. 20260603000003 `doctor_suggestions`). `modules/suggestions/`.
  Doctor: `/api/doctor/suggestions` GET/POST. Admin (super_admin): `/api/admin/suggestions` GET, `/:id` PUT
  (status+admin_response). 57 tests, boot+curl 200, RBAC doctor→403. Reemplaza `app/api/suggestions`.
- **reminders → DIFERIDO Fase 5** (envío real WhatsApp/email es client-side; reminders_settings CRUD de bajo valor).
- 16 **capabilities (RBAC DB-driven)** → ✅ DDD (mig. `20260604000002-role-capabilities.cjs`). Módulo
  FUNDACIONAL. Tabla `role_capabilities` (UNIQUE role+module_key+action; INDEX role). Seed data-driven
  para 5 roles: super_admin/admin (13 módulos×4acc), doctor (15×4), assistant (restringido), patient
  (portal). `ResolveCapabilitiesUseCase` con Redis TTL 300s + fallback DB (degradación silenciosa).
  `SetCapabilityUseCase` invalida `DEL capabilities:{role}` (direct key, no SCAN). `CapabilitiesGuard`
  - `@RequireCapability(moduleKey,action)` reutilizable (fail-closed). `GET /api/me/capabilities`
    (para frontend), `GET/PUT /api/admin/role-capabilities` (super_admin). 42 tests, 100% domain+use-cases.
    Coexiste con RolesGuard (roles = identidad; capabilities = permisos granulares). Auth0-ready
    (resuelve por `@CurrentUser().role`). Cambios en BD aplican sin re-login (cache TTL 300s).
    `modules/capabilities/`.

> Nota: `doctor_schedules` ya existe (mig. 000005) → los slots de appointments/booking (antes
> diferidos por falta de esta tabla) ya son implementables si se requieren.

> `RolesGuard` (`presentation/guards/roles.guard.ts`) reutilizable: aplica con `@Roles('super_admin')`
>
> - DevAuthGuard. Fail-closed. Lo usará admin.

> ⚠️ Pitfall DI/webpack: NUNCA declarar `Sequelize` (ni infra global) en el array `providers`
> de un módulo — crashea el server compilado (dist). Inyectarlo del DI global. Verificar con
> boot del dist (`node dist/apps/backend/main.js`), no solo con tests.

### Módulo Doctor "vendible" — Fases 1–8 (2026-06-11 → 06-12)

- **admin (planes ampliado)** → `plan_configs` +role_key/+is_permanent; nueva `plan_prices` (períodos
  monthly/quarterly/semiannual/annual); `plan_features` +keys IA. CRUD admin de planes/precios/features
  (`/api/admin/plans*`) + catálogo público `GET /api/plans`. Gating = role_capabilities ∩ plan_features.
- **doctor-registration** → `profiles` +mpps_number/colegiado_number/verification_status/verified_at/verified_by.
  `POST /api/doctor/registration` (pending + email a super_admins) + panel admin `GET/PUT /api/admin/doctor-verifications`.
- **credential-verification** → `credential_verifiers` + `credential_verifications`. MPPS automático vía SACS
  (xajax por cédula, async); colegiado = manual. `POST /api/admin/doctor-verifications/:doctorId/verify-mpps`,
  `GET .../credentials`.
- **specialties** → catálogo en BD (seed 29, gestionable sin redeploy). `GET /api/specialties` (público) +
  `POST/PUT /api/admin/specialties` (super_admin).
- **patient-identities** → maestra interna por cédula (`patient_identities` + `patients.identity_id`). Resolución
  idempotente en create-patient/booking. Transparente al doctor (no expone existencia cross-doctor).
- **integrations (Google)** → `google_integrations` (tokens cifrados). `GET/POST/DELETE /api/integrations/google*`.
  Opt-in: Meet en citas online si conecta; si no, fallback `.ics`/Jitsi. OAuth en frontend (state CSRF).
- **availability-blocks** → `doctor_availability_blocks`. `GET/POST/DELETE /api/doctor/availability-blocks`.
  `doctor_schedules` +booking_horizon_weeks (slots/booking lo respetan).
- **telemetry** → `telemetry_sessions` (1 fila/sesión, journey jsonb + PiiGuard). `POST /api/telemetry/session`
  (doctor), `GET /api/telemetry/sessions` (super_admin). Reemplaza `action_events`.
- También tocados: booking/offices (modalidad)/appointments (meet_link+office_id)/doctor-settings (services
  por consultorio)/packages.

### Componentes frontend nuevos (sesión 2026-06)

Editor admin de planes (`/admin/plans`) · `/doctor/upgrade` (tarjetas + upsell, guard `requirePlanFeature`) ·
onboarding obligatorio (`OnboardingForm` + `SpecialtyCombobox` + `CedulaInput` V/E/P; render full-screen sin
sidebar) · panel `/admin/verifications` (+ estado MPPS) · `BookingQrCode` (QR descargable del link público) ·
`TelemetryProvider` (captura low-touch cliente) · `NewAppointmentFlow` (consultorio → modalidad → planes) ·
loader full-screen al redirigir a Auth0 en login. Se quitó WhatsApp y Cita 360 del área doctor.

**PDF (7.8 + 7.3, 2026-06-23):** `components/pdf/` con `@react-pdf/renderer@4.5.1`. `PdfDownloadButton.tsx` = botón **genérico** (`document: ReactElement`). Documentos: `MedicalDocumentPdf.tsx` (Informe/Receta/Indicaciones del doctor con plantilla `doctor_templates` + matrícula) y `SpecialistsReportPdf.tsx` (reporte tabular de especialistas para admin). **Patrón SSR obligatorio:** el `dynamic ssr:false` rodea la COMPOSICIÓN — módulos wrapper `'use client'` (`SpecialistsPdfButton`, `ConsultationInformePdfButton`, `RecetaPdfButton`) que importan estáticamente button+documento y se cargan vía `dynamic ssr:false` en la página. NUNCA envolver el componente-documento en `next/dynamic` (react-pdf no resuelve lazy → PDF vacío).

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
reminders, messages, invitations, settings, services, **booking** (nueva 2026-06-18,
gatea `/book/:doctorId`). El sidebar del doctor los lee para mostrar/ocultar módulos
(status válidos: active, trial, trialing). Keys IA (plan Plus): `ai_assistant`,
`ai_transcription`, `ai_reports`.

**Gating por plan (2026-06-18):** Delta Free = solo `{dashboard, settings, patients,
consultations}` (+ Consultorios/Plantillas, que no tienen moduleKey). Deshabilitados en
Free: agenda, billing, crm, ehr, finances, invitations, messages, reminders, reports,
services, **booking**. Base/Plus = todo; IA solo en Plus. Planes legacy
(trial/basic/professional/clinic) desactivados; activos solo Free/Base/Plus.

## Lote Fase 5 + MVP (2026-06-12) — componentes/módulos añadidos

- **`auth`** → `ProcessLoginTouchUseCase` + `SequelizeLoginTouchRepository` + `POST /api/auth/login-touch`
  (last_sign_in_at + downgrade al login, sin cron). Cableado en `resolve-identity` (Auth0) y en la action de login dev-stub.
- **`finances`** → tasa **dual**: ports `IBinanceRateFetcher`/`IBcvRateFetcher` + impls (fetch nativo), resolución
  perezosa en `RedisUsdtRateStore.getRate()`, use cases `SetRateSource`/`GetRatesSummary`, endpoints
  `/api/admin/settings/rate-source|rates`. Selector en `/admin/settings`.
- **`admin`** → estados de actividad reales (`last_sign_in_at`), `ExportDoctorsUseCase` (`GET /admin/doctors/export`, CSV),
  `GetPublicStatsUseCase` + `PublicStatsController` (`GET /api/public/stats`). Dashboard frontend cablea estados/CxC/pacientes.
- **`appointments`/`booking`** → `appointments.google_calendar_event_id` (cancelable); `get-available-slots` en timezone
  **America/Caracas**. **`integrations`** → recordatorios 30min (Google event reminders + `VALARM` en `.ics`).
- **`consultations`** → `blocks_snapshot` (JSONB) editable: `PUT` lo acepta, GET lo expone; el BFF mapea `blocks_data→blocks_snapshot`.
- **Frontend** → dashboard doctor (cita actual + registrar pago/gasto), KPIs de agenda, "Por ingresar", `description` en
  booking, contador real en landing, route handler `GET /api/doctor/patients/[id]`.

> **Convención (lección QA 2026-06-12):** el BFF/api-client devuelve `envelope.data` en **camelCase**; los componentes
> frontend deben leer camelCase (varios bugs por asumir snake_case: NewAppointmentFlow, consultation-blocks config).

### `document-sharing` — ✅ DDD implementado + frontend cableado (2026-06-18)

Módulo `modules/document-sharing/`. Doctor comparte documentos de consulta (informe/recetas/EHR) vía enlace
público + código 6 dígitos 48h; paciente descarga PDF consolidado (`pdf-lib`). 4 endpoints: 1 autenticado
(doctor) + 3 públicos (verify-code, download, request-code). Session token HMAC-SHA256 15min sin JWT.
Anti-bruteforce (5 intentos). Fire-and-forget email (`MailerService.sendTemplate('shared_documents_code', ...)`).
Tablas: `shared_document_links` + `document_access_codes` (migraciones `20260618000001` + `20260618000002`).

**Doble factor (fix 2026-06-18):** la verificación exige **cédula + código** (`POST .../verify-code` body
`{code, cedula}`); ambos deben matchear al paciente del enlace, mismatch → mismo 422 genérico (anti-oracle).
**Cédula normalizada** (strip espacios/guiones/puntos + uppercase) → tolerante a V/E/P. La descarga usa
`?sessionToken=` (NO `?session=`). El enlace usa `APP_BASE_URL` del backend (ya no `localhost`).

**Frontend (✅ cableado 2026-06-18):**

- `ShareDocumentsModal` (en `consultations/page.tsx`): el doctor selecciona secciones y genera enlace+código.
- `/documents/[token]/page.tsx` (pública): el paciente ingresa **cédula + código** → descarga PDF.
- Route handler `app/api/documents/[token]/verify-code/route.ts` reenvía `{code, cedula}`.

### `booking` — feature gateada por plan (2026-06-18)

La página pública `/book/:doctorId` ahora se gatea con la feature `booking` del **plan efectivo** del doctor.

- Backend: puerto `IBookingFeatureChecker` (dominio booking) + `SequelizeBookingFeatureChecker` (infra, reusa
  modelos de doctor-settings); resuelve plan efectivo (downgrade perezoso) y chequea `plan_features.booking`.
  `GET /api/booking/:id/info` añade `bookingEnabled`; `CreateBookingUseCase` lanza `BookingNotEnabledError`
  (403, `booking-not-enabled.error.ts`) — defensa en profundidad. `BookingModule` registra el checker.
- Frontend: `settings/page.tsx` oculta el tab "Link público"/QR si la feature está off; `book/[doctorId]/page.tsx`
  muestra "Reservas no disponibles" cuando `bookingEnabled=false`. Free=off, Base/Plus=on.

### IA de texto (reactivada, en progreso 2026-06-18)

3 funciones de texto reactivadas (era Supabase): `improve_block` (gating `ai_assistant`), `summarize_report`
(gating `ai_reports`), `patient_history` (gating `ai_assistant`).

- **Frontend BFF (sin commitear):** `app/api/doctor/ai/route.ts` ya NO devuelve 501 — proxea a
  `POST /api/ai/text` vía `backendPost`; valida rol y reenvía body; el frontend lee `data.result`.
- **Backend:** el módulo reusa la infra de `ai-transcription` (adapter Gemini, `ai_request_log`, gating por
  plan). Scaffolding presente: port `application/ports/ai-text-generator.port.ts` (`IAiTextGenerator`) +
  errores de dominio `ai-feature-denied.error.ts`/`ai-text-provider.error.ts`/`patient-not-found-for-ai.error.ts`.
  **(verificar) Falta** el use-case + controller `@Post('text')` + DTO del endpoint `/api/ai/text` (aún no en
  el código a esta fecha). Marcar como **recién reactivado / en construcción**.

### Suscripción — panel corregido (2026-06-18)

- `components/doctor/SubscriptionPanel.tsx`: maneja **plan permanente** (Delta Free) — resuelve plan efectivo +
  `state.is_permanent` y muestra "Plan permanente / ∞ sin vencimiento" (ya no "termina el null"). Botón
  "Mejorar mi plan" → `Link` a `/doctor/upgrade`. El handler backend `GET /api/doctor/subscription` ahora
  envuelve en `{success, data}` (antes el panel se quedaba cargando infinito).
- `app/doctor/upgrade/UpgradeClient.tsx`: resalta el **plan actual** (badge "Plan actual"), leyendo
  `effective_plan_key` de `/api/doctor/features`.
- Backend: `get-doctor-subscription-panel.use-case` + `sequelize-subscription-panel.repository` resuelven plan
  efectivo e `is_permanent`.

### alert() → toast (2026-06-18)

60 `alert()` nativos reemplazados por `showToast` (`@/components/ui/Toaster`) en 12 pantallas doctor+admin
(agenda, cobros, consultations, offices, patients, reminders, services, settings, templates, admin/aprobaciones,
admin/promotions, admin/subscriptions).

### Chat de ayuda — HelpWidget (2026-06-22)

Widget de ayuda con IA, disponible para los 3 perfiles. Patrón: panel global + lanzador en topbar.

- `components/help/HelpWidget.tsx` — panel de chat montado UNA vez en el root `app/layout.tsx`, por lo que
  SOBREVIVE la navegación entre páginas; se resetea solo al cerrarlo (no persiste historial). Mantiene los
  mensajes en estado local y reenvía toda la conversación en cada request (contexto multi-turno). `AbortController`
  cancela la request en vuelo si se cierra. Renderizador markdown-lite seguro (sin `dangerouslySetInnerHTML`).
  Llama al thin-proxy `POST /api/help/chat`. Avisa "No ingreses datos de pacientes".
- `components/help/HelpButton.tsx` — botón "Ayuda" en los topbars de `doctor/admin/patient` layouts.
- `components/help/helpChatStore.ts` — pub/sub singleton (patrón Toaster) que conecta el botón del header con el
  panel del root layout (open/close), sin prop drilling entre layouts.
- Backend: módulo `help-assistant` (ver 04-api-documentation). La guía se elige por rol del CurrentUser; los
  manuales viven como strings TS en `apps/backend/src/modules/help-assistant/guides/`.
