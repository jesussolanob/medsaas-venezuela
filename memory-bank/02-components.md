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
suggestions, settings (+ settings/consultation-blocks), patient-requests.
(cita-360 ELIMINADO el 2026-06-23; **`consultations/[id]` ELIMINADO el 2026-07-07** — el editor de consulta vive inline
en la lista con deep-link `?open=<id>`; "Generar informe" descarga el PDF directo y `ShareDocumentsModal` (compartir
enlace+código, ahora con botón WhatsApp) se montó en la lista. `patient-requests` (solicitudes de documentos al paciente)
ahora es accesible desde el sidebar Consultorio y desde un botón "Documentos (N)" en la ficha. Ver 05-progress-log + ADR-016/017.
**(2026-07-10, batch QA)** consultas: **autoguardado entre bloques** (fix stale closure); **Generar Documento** rediseñado a
**5 tipos con auto-detección** (`GenerateDocumentModal` + helper `consultation-documents.ts` con `computeAvailableDocTypes`/
`buildConsolidatedContent`, reusado por `ShareDocumentsModal`); **Compartir = mismo PDF branded server-side** (ruta Next
`app/api/documents/[token]/pdf/route.ts` renderiza `MedicalDocumentPdf` con `renderToBuffer`, ADR-020); **panel de pago
editable** (método/referencia/comprobante → `PATCH :id/payment-details`). `MedicalDocumentPdf` rebrandeado a "Delta Salud".
Booking público (`/book/[doctorId]`): "Pagar después" + ocultar horarios bloqueados. Ver 05-progress-log + ADR-020.)

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

Estado (orden histórico de módulos):

- 01 auth → Etapa 1 cubierto por `DevAuthGuard` (módulo Auth0 real = Fase 4).
- 02 patients → ✅ DDD completo. PII cifrada (full_name/cedula/phone/email) + search hashes;
  /reveal auditado; búsqueda híbrida; soft delete (paranoid). `modules/patients/`.
- 03 appointments → ✅ DDD. Transiciones de estado + `appointment_changes_log`; optimistic
  lock de paquetes. `modules/appointments/`. **Reschedule ✅** (`PUT /:id/reschedule`, botón "Reagendar" en
  la agenda) que además **mueve el evento de Google Calendar** (`UpdateCalendarEventUseCase` →
  `GoogleCalendarService.updateEventTime`/`events.patch`, `@Optional` best-effort). Diferido: slots (usa
  horarios genéricos).
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
- **shared-files — Seguimiento del Paciente (2026-07-08, ADR-019):** módulo backend NUEVO (`modules/shared-files/`) +
  tabla `shared_files` (mig `20260708000001`). Tareas/comentarios/archivos doctor↔paciente; signed URL on read; anti-IDOR
  doctor/paciente. Endpoints `/api/doctor/shared-files` + `/api/patient/shared-files` (ver 04). Frontend: tab **Seguimiento**
  de la ficha (`patients/page.tsx`, cableado — enviar tarea/comentario/archivo, editar, eliminar, marcar leído, unread badges)
  - portal **`patient/seguimiento/page.tsx`** (antes placeholder, ahora feed + responder). Reemplaza el ex-Supabase
    `lib/shared-files.ts` (stub). Doctor verificado en prod; paciente desplegado (falta QA con cuenta de paciente).
- **offices — horario multi-bloque (2026-07-08, ADR-018):** el `schedule` de cada consultorio (`doctor_offices`, JSONB
  `DayScheduleParams[]`) admite **varios bloques por día** (varias entradas con el mismo `day`). `getEnabledSchedulesForDay()`
  (filter) + slots del booking iteran todos los bloques. Doble anti-solape (self → `OfficeInvalidScheduleError`; cross-consultorio
  → `OfficeScheduleConflictError` 409). Editor en `app/doctor/offices/page.tsx`: por día toggle + lista de bloques + "+ Agregar
  bloque" + validación de solape en vivo (Guardar deshabilitado). Sin migración (JSONB + DTO ya lo soportaban).

### Componentes frontend nuevos (sesión 2026-06)

Editor admin de planes (`/admin/plans`) · `/doctor/upgrade` (tarjetas + upsell, guard `requirePlanFeature`) ·
onboarding obligatorio (`OnboardingForm` + `SpecialtyCombobox` + `CedulaInput` V/E/P; render full-screen sin
sidebar) · panel `/admin/verifications` (+ estado MPPS) · `BookingQrCode` (QR descargable del link público) ·
`TelemetryProvider` (captura low-touch cliente) · `NewAppointmentFlow` (consultorio → modalidad → planes) ·
loader full-screen al redirigir a Auth0 en login. Se quitó WhatsApp del área doctor. **Cita 360° ELIMINADA por completo (2026-06-23)** — frontend (`app/doctor/cita-360/`), endpoint `GET /api/appointments/:id/detail`, use-case `get-appointment-360`, mapper, métodos de repo `findRescheduleChain`/`findChangeLogs`, e imports cross-módulo de AppointmentsModule (Consultations/Finances/Patients/DoctorSettings). Decisión del usuario: la feature no va. El `appointment_code` sigue visible en agenda/cobros (sin problema, por decisión del usuario).

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

### Componentes frontend nuevos (2026-07-12)

- `components/patient/PatientFichaModal.tsx` — modal de **solo lectura** de la ficha del paciente (identidad,
  contacto, datos clínicos, contacto de emergencia, notas). Se abre con "Ver ficha del paciente" DENTRO de la
  consulta, sin sacar al doctor del editor de la consulta.
- `components/doctor/ExchangeRateSection.tsx` — sección compacta de **tasa de cambio** (BCV USD, BCV EUR,
  personalizada) embebida dentro de **Métodos de pago**. Reemplaza la pantalla dedicada
  `/doctor/settings/exchange-rate` (eliminada). Las opciones de pago pasan a ser **colapsables** (acordeón).
- **Tarjeta guía de plantillas** en el inicio del doctor (`app/doctor/page.tsx`): aparece si el doctor aún NO
  tiene logo/firma, invitándolo a configurar sus plantillas.
- Récipe = **PDF de 2 hojas** vía `buildDocumentPages` (`consultation-documents.ts`) → `MedicalDocumentPdf` en
  modo multi-página (`documents=[...]`): hoja 1 "Récipe" (medicamento + dosis), hoja 2 "Indicaciones"
  (+ indicaciones/frecuencia/duración/**presentación**). Bloque "Indicaciones" renombrado a **"Evaluación
  actual"** e integrado al informe (ya no documento suelto). Branding **"Delta Salud"** en toda la UI/emails/PDF.

### Componentes/rutas nuevos (2026-07-17 — 2ª tanda QA)

- **`components/pdf/ReceiptPreview.tsx`** (nuevo): vista previa del recibo en `/doctor/templates` que renderiza el
  generador REAL (`lib/receipt-pdf.ts` `buildReceiptHtml`) en un iframe con datos de ejemplo. Antes la preview
  usaba `MedicalDocumentPdf` (otro motor) → no coincidía con el recibo descargado en Cobros (#7).
- **`PaymentMethodModal` reusado en el dashboard** (`app/doctor/page.tsx`): el atajo "Registrar pago" (botón
  "Cobros" del inicio) abre el modal de método al aprobar un cobro pendiente sin `method_snapshot` → persiste con
  `updatePaymentDetails` (finances) y aprueba. El mismo modal en la consulta ahora **marca pagado directamente**
  (`onConfirmed` → `PATCH approve-payment`), no abre un 2º modal (#2).
- **Landing dinámica de planes** (`public/landing.html` + `app/api/public/plans/route.ts`): la sección de precios
  trae los 3 planes vendibles (Free/Base/Plus) con features desde la BD vía el catálogo público, en vez de las
  duraciones de un solo plan (#1).
- **BFF slots del booking** (`app/api/booking/[doctorId]/slots/route.ts`, nuevo): faltaba → BookingClient recibía
  HTML 404 y no marcaba ocupados/bloqueados. Desempaqueta `{data:{slots}}` (#10).
- **Paraclínico:** el bloque perdió su botón "PDF" viejo (print HTML); el PDF sale por "Generar Documento"
  branded (#5). El toast de "Guardar" del paraclínico muestra el error real del backend (#6).

### Componentes/rutas/fixes nuevos (2026-07-22)

- **`PatientHistoryModal.tsx`** (`app/doctor/consultations/`, nuevo): drawer de **solo lectura** que abre el botón
  **"Revisar historial"** en el editor de consulta (junto a "Ver ficha del paciente"). Muestra las consultas
  anteriores del mismo paciente (excluye la actual, orden DESC, **pagina de 5**) con cada bloque (label de
  `blocks_structure` + valor de `blocks_snapshot`, `paraclinical` como lista) + diagnóstico. 100% frontend: reusa la
  action existente `getPatientConsultations` → `GET /api/consultations/patient/:id` (owner-scoped, ya devolvía la
  consulta completa con `blocks_snapshot`+`blocks_structure`). Sin cambios de backend.
- **credential-verification — fix MPPS/SACS (3 bugs):** `SacsXajaxAdapter` ahora parsea las profesiones desde
  `xajax_tableProfesion` (no `xajax_userTable`) y **decodifica entidades HTML** (`M&Eacute;DICO`→`MÉDICO`);
  `name-matcher` gana `normalizeMpps` (quita prefijo `MPPS`+ceros); `verify-mpps.use-case` compara con normalizeMpps.
  Tests contra el XML real de SACS. Con esto la verificación MPPS automática por fin funciona (antes: todo doctor
  "no coincide").
- **help-assistant — manual del doctor actualizado:** `specialist-guide.content.ts` (recordatorios auto, PDF/firma
  dibujada, Seguimiento, Paraclínico, Generar Documento 5 tipos, período de prueba) + `feature-labels.ts` agrega label
  del plan `free_trial`. El módulo ya inyecta contexto plan-aware (módulos disponibles del plan efectivo) y el prompt
  restringe la ayuda a esos módulos.
- **`GlobalExceptionFilter`:** mensaje 500 genérico ahora en español ("Ocurrió un error inesperado").
- **Migración `20260722000001`:** `ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'trialing'` — el enum PG
  no tenía `trialing` (que el código asigna al trial de onboarding) → rompía TODO registro nuevo en prod. Fix idempotente.

### Fix checkbox del onboarding (2026-07-25)

`app/doctor/onboarding/OnboardingForm.tsx` — el check de Términos usa el patrón **input `sr-only peer` + cuadro
visual (`div aria-hidden`) dentro del `<label>`**. El cuadro tenía además su propio `onClick` de toggle → click en
la caja = doble toggle (div + label→input `onChange`) = no pasaba nada; el texto sí funcionaba. **Regla: en este
patrón el div visual NUNCA lleva handler propio** — el `<label>` es la única fuente de activación. Era el único
caso de `sr-only peer` en el frontend. Detalle en 05-progress-log (2026-07-25).

### Sincronizar calendario — el botón de la agenda + citas presenciales en Google (2026-07-27)

El botón **"Sync Calendar"** de `/doctor/agenda` respondía "Sincronización con Google Calendar disponible
próximamente": su BFF `app/api/doctor/calendar-sync/route.ts` era un **stub 501** de la migración, nunca
cableado. Ahora es un thin-proxy real a `POST /api/appointments/calendar-sync` y el botón dice
**"Sincronizar calendario"** (estaba en inglés, único resto en esa pantalla).

**Hueco de fondo que se destapó:** solo las citas **online** llegaban a Google Calendar. `handleInPerson`
(`integrations/application/services/appointment-notification.service.ts`) mandaba email + `.ics` y NUNCA
tocaba el calendario, porque la integración se construyó alrededor del **Meet**, no del evento. Decisión del
dueño: **toda cita — online y presencial — debe quedar en el calendario**.

- `GoogleCalendarService.createEvent({ withMeet, location })` — evento **con o sin Meet**. Sin Meet no manda
  `conferenceData` ni `conferenceDataVersion` y sí manda `location`. `createEventWithMeet` queda delegando
  (cero cambios para las online). `CreateCalendarEventInput` gana `withMeet?`/`location?`.
- `handleInPerson` crea el evento **best-effort** con la dirección del consultorio: si Google no está
  conectado o la API falla, la cita se agenda igual y el correo/.ics salen igual.
- **El paciente SÍ va como asistente** en las presenciales, igual que en las online (deliberado: la cita
  queda en el calendario de ambos). El **único** camino que NO agrega asistente es el backfill.
- `SyncDoctorCalendarUseCase` (`modules/appointments/.../sync-doctor-calendar.use-case.ts`) = backfill de
  hasta 100 citas próximas sin `google_calendar_event_id`, **secuencial** (rate limit de Google), con
  `findUpcomingWithoutCalendarEvent` nuevo en el repo. Idempotente por el `WHERE ... IS NULL`.
- `CalendarNotConnectedError` (409) → "Conecta tu Google Calendar desde Configuración para sincronizar tus citas".

> **Contador honesto:** `synced` solo suma cuando el `eventId` se persistió. Si Google responde sin `eventId`
> la cita cuenta como `failed` — si no, se reportaría sincronizada y volvería a aparecer en cada corrida.

> **DRY del repo:** `sequelize-appointment.repository.ts` tenía el mapeo fila→`Appointment` duplicado (~35
> líneas) entre `list()` y la query nueva → extraído a `rawRowToDomain(row)` + `RawAppointmentRow` a nivel
> de módulo (los campos enriquecidos `consultation_payment_status`/`consultation_code` son opcionales).

### Preconsultas "Consultas por agendar" + terminología especialista (2026-07-23 — ver ADR-025)

- **Backend módulo NUEVO `modules/pending-consultations/`** (DDD): entidad `PendingConsultation` (`isSchedulable()`,
  `markScheduled()`), repo `IPendingConsultationRepository` (findByIdAndDoctor/findByDoctor/findById/findDueForReminder/
  findExpired/bulkCreate/save/bulkExpire/updateReminderStage), use-cases (get-doctor-list, schedule, cancel, create-bulk,
  create-doctor-bulk [anti-IDOR paciente+plan], expire-due, dispatch-reminders, get-by-token, schedule-by-token),
  `PendingConsultationTokenService` (HMAC namespaced). Tabla `pending_consultations` (mig `20260723000002`) + columnas
  `pricing_plans.validity_days` y `patient_packages.expires_at`. Endpoints en 04-api.
- **Módulos tocados:** `booking` (CreateBookingUseCase: bloque multi-sesión — 1ª cita + adicionales + preconsultas diferidas,
  retrocompatible si `sessions_count<=1`), `doctor-settings` (create/update-service acepta `validity_days`; `PricingPlan`
  gana `validityDays`), `reminders` (cron controller invoca dispatch+expire de preconsultas), `appointments`
  (`findFirstCompletedByPaymentId` para el ancla del recordatorio).
- **Frontend NUEVO:** `app/doctor/pending-consultations/` (page + `PendingConsultationsClient` — lista/filtros/badge de
  vencimiento/modales agendar-cancelar) con item "Consultas por agendar" en el sidebar Consultorio; página pública
  `app/agendar/[token]/` (`AgendarTokenClient` — info por token + selector de slots + confirmar). BFF: `app/api/doctor/
pending-consultations/**`, `app/api/public/pending-consultations/[token]/**`, `app/api/booking/[doctorId]/offices`.
  Booking (`BookingClient.tsx`): paso "agendar ahora las restantes / Agendar después" cuando `sessions_count>1`, envía
  `plan_id`+`additional_sessions`. `NewAppointmentFlow`: modal de diferir (bulk-create). Servicios: campo "Validez (días)".
- **Terminología:** "médico" sustantivo→"especialista" en UI/guías/correos (conserva adjetivos + Dr./Dra.). Mig
  `20260723000001` actualiza plantillas de email en BD.

### Componentes nuevos (2026-07-30)

**`components/doctor/SidebarUtilityBar.tsx`** — pie del menú del especialista. Agrupa
Términos y Condiciones, Política de Privacidad y Cerrar sesión en **una sola fila de
iconos** anclada abajo (antes: tres filas completas, que en pantallas cortas empujaban
los módulos fuera de vista). Libera ~110px de alto.

> **Regla de accesibilidad:** el nombre accesible sale de `aria-label`; el tooltip es
> `aria-hidden` y aparece con `group-hover` **y** `group-focus-visible`, así el teclado
> no queda fuera. **No** poner `title`: el navegador pintaría un segundo tooltip encima.
> `Cerrar sesión` conserva su hover rojo (`--dh-error`); los otros dos, el gris de siempre.

`Configuración` y `Sugerencias` se quedan como filas completas: son módulos, no enlaces
legales, y como icono pierden descubribilidad. Validado en el QA del dueño (2026-07-30).

### Componentes/fixes nuevos (2026-07-25/26 — reactividad, onboarding y perfil)

**`components/doctor/SetupStepper.tsx`** — puesta en marcha del especialista en el
inicio. 5 pasos con barra de progreso (información · consultorio · servicios · marca ·
métodos de pago); solo el siguiente pendiente se expande con su explicación y botón
"Continuar"; el bloque **desaparece** al completar los 5. Sustituye las dos tarjetas
sueltas que sugerían plantillas y consultorio.

> Estados desconocidos: si falla el fetch de consultorios o servicios el paso queda
> `null` y NO se marca pendiente. Preferible no mostrarlo a acusar al especialista de
> algo que sí hizo.

**`components/doctor/WelcomeModal.tsx`** — tour breve de los módulos al entrar, con
puntero al icono de ayuda (IA). El contenido se filtra por plan con `planUnlocks()`: a
un Delta Free no se le prometen Finanzas ni IA. El check "no volver a mostrar" persiste
en `profiles.welcome_dismissed_at` (**no** en localStorage) para que acompañe al
especialista entre dispositivos. Se evalúa **una sola vez por sesión de página** (ref):
el efecto del inicio también corre al cambiar de mes y tras cada mutación.

**`app/api/public/specialties/route.ts`** — BFF público del catálogo de especialidades.
Existía porque el onboarding (Server Component) leía el catálogo con `backendGet`, pero
`/doctor/settings` es cliente y no puede usar el api-client de servidor: por eso mantenía
su propia lista hardcodeada, que se desincronizó.

**Selector de especialidad — regla:** el catálogo de BD trae una entrada llamada
**"Otra"** que duplicaba la opción de texto libre. Ambas pantallas la descartan
(`/^otr[ao]$/i`) y dejan solo "Otra especialidad", que abre el campo libre.

**Inicio (`app/doctor/page.tsx`) — patrón de refresco:** `refreshKey` incrementado por
cada mutación, igual que `/doctor/finances`. NO extraer el loader a `useCallback`:
`react-hooks/set-state-in-effect` lo marca como error.

### Baja de cuenta por el especialista (2026-08-09)

**`app/doctor/settings/DeactivateAccountCard.tsx`** — zona de baja al pie de "Mi perfil".
Modal con confirmación **por frase tipeada** ("DAR DE BAJA"): un sí/no se toca por
accidente. El 422 del backend por citas a futuro trae el conteo real y está redactado
para el usuario, así que se muestra literal en vez de un error genérico.

**Regla de vocabulario:** es DESACTIVACIÓN, nunca borrado. La información queda intacta y
reactivable, así que la UI no dice "eliminar" en ningún lado — prometer un borrado que no
ocurre es peor que no ofrecerlo.

**`ACCOUNT_DEACTIVATED` vs `ACCOUNT_BLOCKED`** — dos códigos 403 sobre el MISMO flag
`profiles.is_active`, distinguidos por `deactivated_by`. Recorrido completo:
`AppAuthGuard` → `hooks/useAccountBlockedGuard.ts` (ahora pasa CUÁL de los dos al
callback) → pantalla de cuenta apagada en `app/doctor/layout.tsx` → `blockedLogoutAction`
→ `/login?deactivated=1`. **Si se agrega un tercer motivo, hay que tocar los cuatro
puntos**; el hook filtra por un `Set` de códigos conocidos y todo lo demás lo ignora.

A quien se dio de baja solo NO se le dice que "fue bloqueado": se lee como sanción.

**`app/admin/verifications/VerificationsClient.tsx`** — badge ámbar "Se dio de baja"
contra el rojo "Acceso bloqueado", y el botón pasa a "Reactivar cuenta". El admin
necesita saber qué está reactivando antes de tocarlo.

### Onboarding y servicios (2026-08-10)

**`app/doctor/onboarding/OnboardingWelcome.tsx`** — lámina de bienvenida previa al paso 1.
Solo se muestra si `initialStep === 1`: a quien el wizard dejó en el paso 2 o 3 darle la
bienvenida se lee como que perdió el avance.

**`lib/schedule-utils.ts` — ahora tiene las operaciones de bloques** (`toggleDay`, `addBlock`,
`removeBlock`, `updateBlock`, `suggestNextStart`, `suggestNextEnd`) como **funciones puras**
`(schedule, …) => nuevoSchedule`. Vivían duplicadas en `/doctor/offices/page.tsx`, y la copia
del onboarding se quedó atrás admitiendo **un solo bloque por día**. **REGLA: cualquier cambio
de horario va acá, no en una pantalla.**

**Vocabulario de servicios — origen de un bug de QA.** `type: 'plan'` = **"Plan de consulta"**
(una consulta) · `type: 'service'` = **"Servicio extra"** (limpieza, examen). El paso 3 del
onboarding mandaba `'service'` mientras se titulaba "Tu primer servicio" y sugería "Consulta
general". Al nombrar las cosas mal en la UI, el tipo equivocado pasó desapercibido.

**Duración de servicio ↔ consultorio (`/doctor/services`).** La duración volvió (se había
quitado el 12-07). **NO cambia el motor de turnos**: el booking usa `slot_duration` del
consultorio. Condiciona la asociación — `officeFits = slot_duration >= duration_minutes`.
Un servicio "General" debe entrar en TODOS los consultorios. Hay guarda al guardar porque la
duración se puede cambiar DESPUÉS de elegir consultorio.

**`components/doctor/PaymentInstructions.tsx`** — pinta `app_settings.platform_payment_instructions`
en viñetas. El texto lo edita el super admin sin pasar por deploy, así que el parser es
tolerante: líneas con `-`/`•`/`·` son ítems, una línea terminada en `:` es título, el resto
párrafos, y un texto corrido **degrada a párrafo sin romperse**.

---

## Componentes tocados en el lote de QA (2026-08-11/12)

| Componente                                              | Qué cambió                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `app/doctor/patients/page.tsx`                          | El guard `if (!doctorId) return` del alta ya no es mudo: avisa. Era la causa raíz del "guardé y se perdió"       |
| `app/doctor/patients/actions.ts`                        | `getPatients` pagina de a 100 (tope real del backend) en vez de pedir 200 y perder el resto                      |
| `app/doctor/agenda/page.tsx`                            | Se eliminaron `acceptAppointment`/`rejectAppointment`: código muerto que ningún botón llamaba                    |
| `components/appointment-flow/steps/StepSchedule.tsx`    | 30 días hacia atrás para el especialista; el horario pasado se marca en punteado pero NO se bloquea              |
| `components/doctor/PlanPaymentModal.tsx`                | Lee `data.path` (no `j.path`), acepta PDF sin MIME por extensión, y permite cambiar la periodicidad adentro      |
| `app/doctor/consultations/ConsultationsClient.tsx`      | Rótulo "Consulta 2 de 3" (helper `sessionLabel`) y **monto del cobro editable** en el panel de pago              |
| `app/doctor/offices/page.tsx` + `lib/schedule-utils.ts` | Selector de duración POR BLOQUE con "aplicar a todos" (`setBlockDuration` / `setDurationForAllBlocks`)           |
| `app/doctor/services/page.tsx`                          | `maxSlotOf()`: el servicio entra si ALGÚN bloque lo sostiene. Además corrige la lectura camelCase del wire       |
| `app/doctor/onboarding/*`                               | Isotipo real (`DeltaMark`), soporte por WhatsApp, "tu primer servicio", y `irAlPaso()` que sube la vista al tope |
| `app/doctor/settings/DeactivateAccountCard.tsx`         | Cuando la baja queda programada muestra hasta cuándo conserva el plan, en vez de cerrar la sesión                |

**Backend:** `SearchPatientsUseCase` (normaliza como el hash), `SequelizeConsultationRepository`
(sesión del combo), `SequelizeFinanceRepository` + `SequelizePaymentRepository` (ingreso =
confirmado y pagado), `DaySchedule` VO + `GetAvailableSlotsUseCase` (duración por bloque),
`ProcessLoginTouchUseCase` (reactivación), `DeactivateOwnAccountUseCase` +
`ApplyScheduledDeactivationsUseCase` (baja programada). `normalizeForSearch` se exporta desde
`@delta/shared-crypto` para que la búsqueda parcial use el MISMO criterio que el hash.
