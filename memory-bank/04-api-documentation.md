# 04 — API Documentation

> Endpoints del backend NestJS. Actualizar con CADA endpoint nuevo: método, ruta,
> roles, body schema, respuesta, TTL de caché.

## Envelope estándar

```jsonc
// éxito
{ "success": true, "data": { } }
// lista paginada
{ "success": true, "data": [], "meta": { "total": 100, "page": 1, "limit": 20 } }
// error (GlobalExceptionFilter)
{ "success": false, "code": "DOMAIN_ERROR_CODE", "message": "Mensaje al usuario" }
```

## Endpoints NestJS

> Auth Etapa 1: `DevAuthGuard` (headers `x-dev-user-id`, `x-dev-user-role`). `doctor_id`
> SIEMPRE se toma de `user.sub` (anti-IDOR), nunca del body. Prefijo global `api`.

### Health

| Endpoint      | Método | Auth    | Respuesta                                                                            |
| ------------- | ------ | ------- | ------------------------------------------------------------------------------------ |
| `/api/health` | GET    | Pública | `{ status, timestamp, dependencies: { postgres, redis } }`. `ok` solo si ambos `up`. |

### Preconsultas "Consultas por agendar" (2026-07-23 — ver ADR-025)

Módulo `pending-consultations`. Envelope `{success,data}`. Doctor scoped por `user.sub` (anti-IDOR); públicos por token HMAC.

| Endpoint                                            | Método | Auth            | Body / Query                                                                           | Respuesta                                                                                                                                               |
| --------------------------------------------------- | ------ | --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/doctor/pending-consultations`                 | GET    | doctor          | `?status=` (pending_scheduling\|scheduled\|expired\|cancelled)                         | lista owner-scoped                                                                                                                                      |
| `/api/doctor/pending-consultations`                 | POST   | doctor          | `{patient_id, plan_id, session_numbers[], payment_id?, office_id?, appointment_mode?}` | bulk-create (valida ownership paciente+plan; `expires_at` desde `plan.validity_days`)                                                                   |
| `/api/doctor/pending-consultations/:id/schedule`    | POST   | doctor          | `{scheduled_at, office_id?, appointment_mode?}`                                        | crea cita+consulta en tx, consume, `status=scheduled`                                                                                                   |
| `/api/doctor/pending-consultations/:id/cancel`      | PUT    | doctor          | —                                                                                      | `status=cancelled`                                                                                                                                      |
| `/api/public/pending-consultations/:token`          | GET    | Pública (token) | —                                                                                      | `{doctor_id, plan_name, session_number, expires_at, is_schedulable, doctor_name}` (sin PII; token inválido→404)                                         |
| `/api/public/pending-consultations/:token/schedule` | POST   | Pública (token) | `{scheduled_at, office_id?, appointment_mode?}`                                        | `{scheduled:true, session_number}`                                                                                                                      |
| `/api/cron/appointment-reminders`                   | POST   | CronSecret      | —                                                                                      | (ampliado) ahora también despacha recordatorios escalonados de preconsultas + expira vencidas → `pendingRemindersSent/Skipped/Failed`, `pendingExpired` |

> `POST/PUT /api/doctor/services` ahora aceptan `validity_days` (nullable). Booking `POST /api/book` acepta `plan_id` + `additional_sessions[]` (opcionales, retrocompatibles).

### Storage image proxy (BFF — route handler Next, NO NestJS) — 2026-07-07

> Excepción: NO vive en `apps/backend`. Es un route handler de `apps/frontend`
> (`app/api/storage/image-proxy/route.ts`). Existe porque `@react-pdf/renderer`
> carga imágenes con `fetch()` (preflight CORS) y el bucket GCS no tiene CORS para
> `deltasalud.app` → los logos/firmas no cargaban en el PDF (un `<img>` sí, react-pdf no).

| Endpoint                                | Método | Auth | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/storage/image-proxy?url=<gcsUrl>` | GET    | —    | Fetch server-side de la imagen y stream de vuelta (sin CORS). **Guard anti-SSRF:** solo `https://storage.googleapis.com/` (el `/` final bloquea `...com@`/`...com.evil`); `redirect:'error'`; `X-Content-Type-Options: nosniff`; `Cache-Control: max-age=3600`. Usado por `components/pdf/MedicalDocumentPdf.tsx` (`proxyGcsUrl()`). **DEUDA:** configurar CORS del bucket `delta-files-sodium-shard-499116-r3` y eliminar el proxy. |

### Shared Files — Seguimiento del Paciente (módulo ✅ — 2026-07-08)

> Tareas/instrucciones/comentarios/archivos doctor↔paciente. Tabla `shared_files`. Archivos: subir a
> `/api/storage/upload` (kind=document) → guardar el path → **signed URL fresca on read**. Anti-IDOR:
> doctor por `doctor_id=user.sub`; paciente por `auth_user_id=user.sub`.

| Endpoint                                 | Método | Auth    | Notas                                                                                                                      |
| ---------------------------------------- | ------ | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/api/doctor/shared-files?patientId=`    | GET    | doctor  | Lista del paciente (fileUrl = signed URL fresca). Valida ownership del paciente.                                           |
| `/api/doctor/shared-files`               | POST   | doctor  | Crear. Body `{patientId,title,description?,category,filePath?,fileType?,fileSizeBytes?,parentTaskId?}`. created_by=doctor. |
| `/api/doctor/shared-files/:id`           | PATCH  | doctor  | Editar `{title?,description?,status?}` (scoped).                                                                           |
| `/api/doctor/shared-files/:id`           | DELETE | doctor  | Borrar fila (limpieza objeto GCS diferida).                                                                                |
| `/api/doctor/shared-files/mark-read`     | POST   | doctor  | `{patientId}` → read_by_doctor=true en los del paciente.                                                                   |
| `/api/doctor/shared-files/unread-counts` | GET    | doctor  | `{ [patientId]: number }` (created_by=patient & !read_by_doctor) — badges.                                                 |
| `/api/patient/shared-files`              | GET    | patient | Lista del paciente logueado (auth_user_id).                                                                                |
| `/api/patient/shared-files`              | POST   | patient | Crear respuesta (created_by=patient); patient_id/doctor_id del propio registro.                                            |
| `/api/patient/shared-files/mark-read`    | POST   | patient | read_by_patient=true en los del doctor.                                                                                    |

### Appointments (módulo ✅)

| Endpoint                           | Método | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/appointments`                | GET    | Lista paginada del doctor (filtros date_from/to, status, page, limit). PII enmascarada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/api/appointments/:id`            | GET    | Detalle (ownership).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/api/appointments`                | POST   | Crear. Optimistic lock de paquetes; duplicado ±15min → AppointmentDuplicateError; slot ocupado → AppointmentConflictError.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/api/appointments/:id/status`     | PUT    | Transición de estado (scheduled→confirmed→completed/no_show/cancelled) + audit en `appointment_changes_log`. Inválida → AppointmentInvalidTransitionError. Al `cancelled` cancela el evento de Google Calendar (best-effort).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/api/appointments/:id/reschedule` | PUT    | Reagenda (scheduled\|confirmed). Valida ownership + solape (doctor y paciente) + audit. **Mueve el evento de Google Calendar** a la nueva hora (best-effort, `UpdateCalendarEventUseCase` → `events.patch` con `sendUpdates:'all'`; conserva Meet/invitados; notifica al paciente). BFF: `POST /api/doctor/reschedule` `{appointmentId,newDate}`. UI: botón **"Reagendar"** en el detalle de la cita (agenda). Verificado en prod 2026-07-24 (10:00→15:00 movió el evento en el calendar del doctor y del paciente).                                                                                                                                                                                                                                                                                                  |
| `/api/appointments/calendar-sync`  | POST   | **(2026-07-27)** Backfill de Google Calendar: manda al calendario del especialista las citas PRÓXIMAS (`scheduled_at >= now`, status `scheduled\|confirmed`) que aún no tienen `google_calendar_event_id` — máx. 100 por corrida, **secuencial** (rate limit de Google). `doctorId` de `user.sub`. Sin Google conectado → `CalendarNotConnectedError` **409** ("Conecta tu Google Calendar desde Configuración…"). Devuelve `{total, synced, failed}`. **NO manda correos, .ics ni `attendeeEmail`** (evita que Google reenvíe invitaciones por citas viejas) — a diferencia del alta de cita, que sí invita al paciente. Idempotente por diseño (`WHERE google_calendar_event_id IS NULL`). BFF: `POST /api/doctor/calendar-sync` (arma el mensaje en español). UI: botón **"Sincronizar calendario"** en la agenda. |
| _(diferido)_                       |        | `/slots` (usa horarios genéricos por ahora).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Patients (módulo ✅ — PII cifrada AES-256-GCM)

| Endpoint                   | Método | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/patients`            | GET    | Lista paginada MÍNIMA enmascarada (id, fullName, cedula, phone, email, source, createdAt).                                                                                                                                                                                                                                                                                                                                                       |
| `/api/patients/:id`        | GET    | Detalle (enmascarado, ownership).                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/api/patients/:id/reveal` | GET    | Plaintext + 1 fila por campo PII en `access_audit_log`.                                                                                                                                                                                                                                                                                                                                                                                          |
| `/api/patients`            | POST   | Crear. **Cédula OBLIGATORIA 4-15 díg** (2026-07-16). **Email O teléfono obligatorio** (al menos uno, `.refine`). Cédula ÚNICA por doctor → DuplicatePatientError. **Email NO único** (varios pacientes pueden repetirlo — mig `20260716000002` dropea el índice UNIQUE); sólo se rechaza el email del PROPIO doctor → `PatientEmailIsDoctorError`. `presentation` de prescripciones acepta null (mig no; DTO coerce null→undefined, 2026-07-17). |
| `/api/patients/:id`        | PUT    | Actualizar (recalcula search hashes). Cédula no-nullable. Misma regla anti-email-del-doctor.                                                                                                                                                                                                                                                                                                                                                     |
| `/api/patients/:id`        | DELETE | Soft delete (paranoid).                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/api/patients/search?q=`  | GET    | Híbrido: hash exacto (cédula V-/E- o email) o substring in-app (nombre).                                                                                                                                                                                                                                                                                                                                                                         |

### Consultations (módulo ✅ — campos clínicos cifrados)

| Endpoint                                 | Método | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------- |
| `/api/consultations`                     | GET    | Lista paginada (filtros date_from/to ISO, payment_status pending/approved).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/api/consultations/:id`                 | GET    | Detalle clínico descifrado (ownership).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `/api/consultations/patient/:patientId`  | GET    | Historial del paciente (ownership).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/api/consultations/with-patient`        | GET    | **Billing:** consultas del doctor con patient_name/phone/email DESCIFRADOS (owner-scoped, mapper dedicado NO enmascarado). Declarado ANTES de `:id`. `?limit` máx 200. Anti-IDOR doble scope. ⚠️ expone PII al doctor dueño → revisar en QA security. **(2026-07-12)** Nuevos campos via LEFT JOIN a `appointments`: `scheduled_at                                                                                                                                                                                                                                                                                                                                                   | null`, `appointment_mode | null`, `duration_minutes | null`. Amount calculado como `COALESCE(c.amount, a.plan_price, 0)`→`amount_usd` nunca null. |
| `/api/consultations`                     | POST   | Crea con `consultation_code` único DLT-YYYYMM-XXXX (retry ante colisión UNIQUE).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/consultations/:id`                 | PUT    | Actualiza campos clínicos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/api/consultations/:id/payment`         | PUT    | Aprueba pago (pending→approved). Ya aprobado → PaymentAlreadyApprovedError.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/api/consultations/:id/payment-details` | PATCH  | **(2026-07-10)** Edita detalles de pago: `payment_status`, `payment_method`, `payment_reference`, `payment_receipt_url`, `amount` (todos opcionales). Editable AUNQUE esté aprobado (sin PaymentAlreadyApprovedError). Semántica: ausente=no toca, `null`=limpia. Setea `payment_date` al aprobar. Columnas `payment_reference`+`payment_receipt_url` (mig `20260710000003`). Anti-IDOR. **(2026-07-12 fix)** `approveWithExtras()` y `updatePaymentDetails()` ahora sincronizan la fila `payments` vinculada (vía `appointments.payment_id`) en la MISMA transacción → Cobros ya no muestra todo como "pendiente". Mig `20260712000010` hace backfill de históricos inconsistentes. |

### EHR + Prescriptions (módulo ✅ — campos clínicos cifrados; ParseUUIDPipe en params; create-prescription valida ownership del paciente)

| Endpoint                                                          | Método   | Notas                                                                                 |
| ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `/api/ehr/patient/:patientId`, `/api/ehr/:id`                     | GET      | Historia clínica (diagnosis/treatment_plan cifrados).                                 |
| `/api/ehr`, `/api/ehr/:id`                                        | POST/PUT | Crear/actualizar registro EHR.                                                        |
| `/api/prescriptions/patient/:patientId`, `/api/prescriptions/:id` | GET      | Recetas (medication/dosage cifrados).                                                 |
| `/api/prescriptions`                                              | POST     | Emitir receta.                                                                        |
| _(diferidos)_                                                     |          | `/:id/pdf` (req. doctor_templates + lib PDF); acceso rol-paciente (→ patient-portal). |

### Packages (módulo ✅ — doctor)

| Endpoint                           | Método | Notas                                               |
| ---------------------------------- | ------ | --------------------------------------------------- |
| `/api/packages/patient/:patientId` | GET    | Paquetes de un paciente (ownership). ParseUUIDPipe. |
| `/api/packages`                    | POST   | Crear paquete prepagado.                            |

> ConsumePackageSession usa optimistic lock (`QueryTypes.UPDATE` + retry) — consumido por el booking.

### Booking público (módulo ✅ — SIN auth)

| Endpoint                                 | Método | Notas                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/booking/:doctorId/info`            | GET    | Datos públicos del doctor + **`bookingEnabled`** (feature `booking` del plan efectivo — 2026-06-18). 404 si no existe/inactivo (anti-enumeración).                                                                                    |
| `/api/booking/:doctorId/plans`           | GET    | Pricing plans con `show_in_booking=true`.                                                                                                                                                                                             |
| `/api/booking/:doctorId/packages?email=` | GET    | Saldo de paquetes del paciente por email (Zod email; no filtra PII).                                                                                                                                                                  |
| `/api/booking`                           | POST   | Crea cita pública: find-or-create paciente (PII cifrada) + cita + consumo de paquete en **transacción atómica**. Respuesta sin `patientId`. **403 `BookingNotEnabledError`** si el plan del doctor no incluye `booking` (2026-06-18). |
| _(diferidos Etapa 2)_                    |        | `/slots` (req. doctor_schedule); **Turnstile real + rate limiting** (hoy stub — go-live blocker).                                                                                                                                     |

### Finances (módulo ✅)

| Endpoint                                                    | Método | Auth                         | Notas                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| `/api/finances/summary?month=YYYY-MM`                       | GET    | doctor                       | Resumen del mes. `net` con signo (puede ser negativo). month inválido→400. **(2026-07-12)** Nuevos campos: `incomeBreakdown:{consultationsApproved,consultationsPending,manualIncome}` y `expenseBreakdown:{rent,staff,supplies,services,taxes,other}` (todos en USD, zero-fill sin datos). |
| `/api/finances/transactions`                                | GET    | doctor                       | Lista paginada de ingresos/gastos. **(2026-07-12)** Incluye `expense_concept: 'rent'                                                                                                                                                                                                        | 'staff' | 'supplies' | 'services' | 'taxes' | 'other'                                                                                                            | null`. |
| `/api/finances/income-transactions?month=YYYY-MM&limit=200` | GET    | doctor                       | (7.9) Ingresos manuales con `patientName` descifrado (owner-scoped; null si corrupto). Máx 200. Para gráficas fieles.                                                                                                                                                                       |
| `/api/finances/income`                                      | POST   | doctor                       | Registrar ingreso manual (amount>0). (7.9) Acepta `patientId?` y `relatedConsultationId?`: si viene consulta, el paciente se deriva de ella (anti-IDOR, ignora patientId); consulta ajena→404.                                                                                              |
| `/api/finances/expense`                                     | POST   | doctor                       | Registrar gasto. **(2026-07-12)** Acepta `concept?: 'rent'                                                                                                                                                                                                                                  | 'staff' | 'supplies' | 'services' | 'taxes' | 'other'`(opcional, null si no viene). Mig`20260712000013`agrega`expense_concept VARCHAR(40)` con CHECK constraint. |
| `/api/settings/usdt-rate`                                   | GET    | **Pública**                  | Tasa USDT/Bs (Redis TTL 600s + fallback app_settings; null si no seteada).                                                                                                                                                                                                                  |
| `/api/admin/settings/usdt-rate`                             | POST   | **super_admin** (RolesGuard) | Actualiza tasa + invalida Redis. doctor→403.                                                                                                                                                                                                                                                |

### Doctor settings (módulo ✅)

| Endpoint                                           | Método              | Notas                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/doctor/profile`                              | GET/PUT             | Perfil del doctor (incluye payment_details/payment_methods, solo del dueño).                                                                                                                                                                                                        |
| `/api/doctor/schedule`                             | GET/PUT             | Horario (default L-V 08:00-17:00 30min si no existe). PUT invalida Redis slots:{id}:\*.                                                                                                                                                                                             |
| `/api/doctor/features`                             | GET                 | Features del plan (Redis cache TTL 3600, degrada a DB si Redis cae). Incluye `effective_plan_key` (lo usa UpgradeClient para resaltar el plan actual).                                                                                                                              |
| `/api/doctor/subscription`                         | GET                 | Panel de suscripción envuelto en **`{ success, data }`** (2026-06-18 — antes el panel cargaba infinito). Resuelve plan efectivo + `state.is_permanent` (plan permanente Free → "∞ sin vencimiento", sin "termina el null") + `bannerLevel` (suspended/critical≤3d/warning≤7d/none). |
| `/api/doctor/services`, `/api/doctor/services/:id` | GET/POST/PUT/DELETE | Pricing plans del doctor (ownership).                                                                                                                                                                                                                                               |
| _(diferido)_                                       |                     | `/doctor/templates` (req. tabla doctor_templates + PDF).                                                                                                                                                                                                                            |

### Patient portal (módulo ✅ — rol patient, scope por auth_user_id)

| Endpoint                     | Método   | Notas                                                                                           |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `/api/patient/dashboard`     | GET      | Próxima cita + paquetes activos + total.                                                        |
| `/api/patient/appointments`  | GET      | Citas del paciente (por auth_user_id).                                                          |
| `/api/patient/packages`      | GET      | Paquetes activos + info del doctor (nombre, booking link).                                      |
| `/api/patient/prescriptions` | GET      | Recetas propias (descifradas).                                                                  |
| `/api/patient/messages`      | GET/POST | Conversación con el doctor (POST direction=patient_to_doctor; valida relación). doctor_id UUID. |
| `/api/patient/profile`       | GET/PUT  | Perfil propio del paciente.                                                                     |
| _(diferidos)_                |          | `/prescriptions/:id/pdf` (PDF); `/reports` (decisión de producto).                              |

> Regla anti-IDOR: TODO se scopea por `auth_user_id = user.sub`, nunca por ids del cliente.

### Admin (módulo ✅ — TODOS super_admin, RolesGuard a nivel de clase)

| Endpoint                                                                    | Método  | Notas                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/dashboard`                                                      | GET     | KPIs (médicos por actividad, citas 30d, pacientes, suscripciones por vencer). Redis cache 300.                                                                                              |
| `/api/admin/doctors`, `/api/admin/doctors/:id`                              | GET     | Lista (filtros activity_status/subscription_status → 400 si inválido) + detalle.                                                                                                            |
| `/api/admin/doctors/:id/subscription`                                       | PUT     | Actualiza suscripción (Zod) + invalida cache.                                                                                                                                               |
| `/api/admin/doctors/:id/access`                                             | PUT     | **Bloquear/desbloquear acceso** (ban duro). Body `{ is_active, reason? }`. Setea `profiles.is_active`. No bloquea super_admin ni self (422 `CANNOT_BLOCK_SUPER_ADMIN`/`CANNOT_BLOCK_SELF`). |
| `/api/admin/subscriptions`                                                  | GET     | Todas con filtros.                                                                                                                                                                          |
| `/api/admin/plans`, `/api/admin/plans/:planKey`                             | GET/PUT | Planes (toggle is_active, Zod).                                                                                                                                                             |
| `/api/admin/plan-features`, `/api/admin/plan-features/:planKey/:featureKey` | GET/PUT | Toggle feature (upsert + invalida features:{plan}).                                                                                                                                         |
| `/api/admin/patients`                                                       | GET     | Stats globales (solo counts, sin PII).                                                                                                                                                      |
| `/api/admin/settings`                                                       | GET/PUT | Config general clave/valor (no expone secretos). PUT upsert de cualquier key (editor genérico).                                                                                             |
| `/api/admin/email-templates`, `/api/admin/email-templates/:name`            | GET/PUT | **Editor de plantillas de email**. GET lista (resumen) / GET :name (subject+html+text) / PUT :name (parcial). Solo edita existentes (no crea/borra). 404 `EMAIL_TEMPLATE_NOT_FOUND`.        |

### Diagnóstico y auditoría

| Endpoint              | Método | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `email_send_log` (BD) | —      | Tabla de diagnóstico (sin endpoint público). Registra cada correo enviado: `recipient_type`, `recipient_id` (uuid, NO email), `template_name`, `status` (sent\|failed), `provider`, `provider_message_id`, `error_detail`, `created_at`. **Cero PII.** Fuente: `MailerService.sendTemplate(name, to, data, recipient?)` (logging defensivo: si falla, no rompe el envío). 7 callers reales: `share-consultation` + `request-new-code` (→ paciente), `complete-registration` (→ admins), `appointment-notification` (→ paciente), `approve-subscription-payment` + `send-invoice-email` + `send-reminder-email` (→ doctor). Para diagnóstico post-mortem sin exponer datos sensibles. |

> Nota: `POST /admin/settings/usdt-rate` vive en el módulo finances (no duplicado). lastSignInAt/activity
> tracking llega en Fase 4 (auth).
> **Ban de cuenta:** `AppAuthGuard` (choke point de TODOS los controllers guardados) verifica `profiles.is_active`
> tras resolver `request.user`: si role≠super_admin e is_active=false → **403 `ACCOUNT_BLOCKED`**. super_admin
> nunca se bloquea (anti-lockout); fail-open si el perfil no existe. El listado de verificaciones expone `isActive`.

### Módulo `payments` (cobros de consulta) — Grupo A ✅ (2026-06-03)

| Endpoint                           | Método | Notas                                                                               |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `/api/doctor/payments`             | GET    | Lista paginada del doctor. Filtros: `consultation_id`, `status`, `limit`, `offset`. |
| `/api/doctor/payments`             | POST   | Registra pago (Zod). Verifica ownership de la consulta. status='pending'.           |
| `/api/doctor/payments/:id/approve` | PUT    | pending→approved. Sincroniza `consultations.payment_status='approved'`.             |
| `/api/doctor/payments/:id/reject`  | PUT    | pending→rejected. Body opcional `{notes}`.                                          |

> doctorId SIEMPRE de `user.sub` (anti-IDOR). Respuesta sin PII (solo `patient_id`). Transacciones
> envuelven el pago + sync de la consulta. Reemplaza legacy `app/api/doctor/payments` (GET/POST/PATCH→PUT).
> ⚠️ Sistema SECUNDARIO (consultation_payments). El principal es `/api/finances/payments` (abajo).

### Pagos principales `payments`+`payment_items` (en módulo finances) — Grupo A ✅ (2026-06-03)

> Fuente de verdad financiera (cobros/dashboard/finanzas). doctorId de `user.sub`.

| Endpoint                                   | Método | Notas                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/finances/payments`                   | GET    | Lista del doctor con joins appointment+consultation. Filtros status/from_date/to_date. Forma = `PaymentRow` de lib/finances.ts. (7.10) incluye `patient_phone` (texto plano, sin enmascarar) para el cobro por WhatsApp.                                                                                                                                 |
| `/api/finances/payments/totals`            | GET    | KPIs {approvedUsd,pendingUsd,approvedCount,pendingCount}.                                                                                                                                                                                                                                                                                                |
| `/api/finances/payments/:id/status`        | PUT    | {status:'pending'\|'approved'}. Sincroniza `consultations.payment_status`.                                                                                                                                                                                                                                                                               |
| `/api/finances/payments/:id/items`         | GET    | Line-items del pago.                                                                                                                                                                                                                                                                                                                                     |
| `/api/finances/payments/:id/items`         | POST   | {name,amount_usd,source_type?,source_id?}. Recalcula total + appointment.plan_price.                                                                                                                                                                                                                                                                     |
| `/api/finances/payments/:id/items/:itemId` | DELETE | Borra item + recalcula.                                                                                                                                                                                                                                                                                                                                  |
| `/api/finances/payments/:id/receipt`       | PATCH  | `{receipt_url:string}`. Adjunta comprobante GCS. Anti-IDOR.                                                                                                                                                                                                                                                                                              |
| `/api/finances/payments/:id/details`       | PATCH  | **(2026-07-12)** Edita detalles financieros desde el drawer de Cobros: `{paid_at?,method?,reference?,bcv_rate?,amount_bs?}` (todos opcionales; `null`=limpiar). Sincroniza la consulta vinculada en la misma transacción. Devuelve `{id,paid_at,method_snapshot,payment_reference,bcv_rate,amount_bs,amount_usd,status}`. Anti-IDOR (doctorId del auth). |

> CreateBooking crea la fila `payments` (status pending) y enlaza `appointments.payment_id`.
> Diferido Fase 5: subida de comprobante (storage→GCS), realtime, PDF de recibo.

### Billing — suscripciones y facturación (módulo ✅ 2026-06-04)

#### Subscription Payments (admin)

| Endpoint                                           | Método | Roles       | Notas                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/subscription-payments`                 | POST   | super_admin | Registra pago manual (ya aprobado). Body: `{ doctor_id, amount_usd, method, duration_months, reference_number? }`. TRANSACCIONAL.                                                                                                                           |
| `/api/admin/subscription-payments`                 | GET    | super_admin | Lista pagos. Query: `?status=pending\|approved\|rejected`, `?page`, `?limit`. Respuesta incluye: `amountBs, bcvRateUsed, bankCode, planKey, period, rejectionReason, hasReceipt`.                                                                           |
| `/api/admin/subscription-payments/:id/approve`     | PUT    | super_admin | Aprueba el pago. TRANSACCIONAL: marca approved + extiende sub + si `payment.planKey` → cambia `profiles.plan` + `subscriptions.plan` + sync profiles snapshot + inserta subscription_changes_log. Sin body. Lanza 422 si ya resuelto, 404 si no encontrado. |
| `/api/admin/subscription-payments/:id/reject`      | PUT    | super_admin | Rechaza el pago. Body: `{ reason?: string }`. Guarda `rejection_reason` en BD.                                                                                                                                                                              |
| `/api/admin/subscription-payments/:id/receipt-url` | GET    | super_admin | Devuelve URL firmada (TTL 15 min) del comprobante. 404 si no existe o no tiene comprobante. NUNCA expone el path GCS crudo.                                                                                                                                 |

> La extensión de suscripción parte de max(now, currentExpiresAt) + payment.duration_months.
> Lanza SubscriptionPaymentNotFoundError(404) y SubscriptionPaymentAlreadyResolvedError(422) si procede.
> Reemplaza: `app/api/admin/payments/route.ts` + `approve/route.ts` + `reject/route.ts`.

#### Subscription Payments — autogestión del especialista (WP-B, 2026-08-05)

| Endpoint                                          | Método | Roles  | Notas                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/doctor/subscription-payments/checkout-info` | GET    | doctor | Info de checkout: `{ planName, planKey, period, amountUsd, amountBs, bcvRate, bcvRateDate, banks[], paymentInstructions }`. Query: `?planKey=&period=`. Calcula `amountBs` en servidor (nunca del cliente). Lanza 503 si falta tasa BCV. |
| `/api/doctor/subscription-payments`               | POST   | doctor | Envía comprobante. Body: `{ planKey, period, bankCode, referenceNumber, receiptPath, notes? }`. Anti-spam: 1 pago pendiente a la vez. Anti-IDOR: `receiptPath` debe empezar con `receipt/{doctorId}/`. `doctorId` siempre de `user.sub`. |
| `/api/doctor/subscription-payments`               | GET    | doctor | Historial propio paginado. Respuesta: `{ id, planKey, period, amountUsd, amountBs, bcvRateUsed, bankCode, referenceNumber, status, rejectionReason, createdAt, reviewedAt, hasReceipt }`. NUNCA expone `receiptUrl` raw.                 |

> **Errores de dominio nuevos (WP-B):**
>
> - `PlanNotFoundForCheckoutError` (422) — plan/período no existe o está inactivo
> - `RateUnavailableError` (503) — no hay tasa BCV en app_settings
> - `PendingPaymentExistsError` (409) — ya existe un pago pendiente para este doctor
> - `ReceiptPathNotOwnedError` (422) — `receiptPath` no pertenece al doctor autenticado
>
> **Migración:** `20260805000002-subscription-payments-doctor-checkout.cjs` — agrega 8 columnas a `subscription_payments` + seed `platform_payment_instructions` en `app_settings`.

#### Invoices — facturas de plataforma (admin)

| Endpoint                       | Método | Roles       | Notas                                                                                                                          |
| ------------------------------ | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/api/admin/invoices`          | POST   | super_admin | Crea factura. Body: `{ doctor_id (uuid), amount (number), currency? (3 chars), description? }`. Número auto FAC-YYYYMMDD-XXXX. |
| `/api/admin/invoices`          | GET    | super_admin | Lista todas las facturas paginadas. `?page`, `?limit`.                                                                         |
| `/api/admin/invoices/:id/paid` | PUT    | super_admin | Marca factura como pagada (idempotente). Sin body. Lanza InvoiceNotFoundError(404).                                            |

> Reemplaza: `app/api/admin/invoices/route.ts` + `app/api/admin/mark-invoice-paid/route.ts`.

#### Billing Documents — documentos fiscales (doctor)

| Endpoint              | Método | Roles  | Notas                                                                                                                                                                                                    |
| --------------------- | ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/doctor/billing` | GET    | doctor | Lista documentos propios (anti-IDOR: doctorId=user.sub). `?page`, `?limit`. Respuesta NO incluye patientId (PII).                                                                                        |
| `/api/doctor/billing` | POST   | doctor | Crea documento. Body: `{ doc_type, total, items?, iva_amount?, igtf_amount?, bcv_rate?, total_bs?, notes?, currency?, consultation_id?, payment_id?, patient_id? }`. Número auto `<TYPE>-YYYYMMDD-XXXX`. |

> doctorId SIEMPRE de user.sub. patientId se almacena pero no se devuelve en respuestas (anti-PII).
> Reemplaza: `app/api/doctor/billing/route.ts` + `lib/subscription.ts` (extendSubscription/logSubscriptionChange).

### Capabilities — RBAC por capacidades (DB-driven) ✅

| Endpoint                       | Método | Roles                     | Notas                                                                                                                                                                                  |
| ------------------------------ | ------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- | ------------------------------------------------------------------- |
| `/api/me/capabilities`         | GET    | Cualquier rol autenticado | Mapa `{role, modules:{[moduleKey]:{view,create,edit,delete}}}` del rol del usuario autenticado. Cache Redis TTL 300s; fallback DB si Redis cae. Default-deny (acción ausente = false). |
| `/api/admin/role-capabilities` | GET    | super_admin               | Todos los rows agrupados por rol: `{[role]: [{id, role, module_key, action, allowed}]}`.                                                                                               |
| `/api/admin/role-capabilities` | PUT    | super_admin               | Upsert ON CONFLICT. Body: `{role (UserRole), module_key (string), action (view                                                                                                         | create | edit | delete), allowed (boolean)}`. Invalida Redis `capabilities:{role}`. |

Decorator reutilizable: `@RequireCapability('finanzas', 'view')` en conjunto con `CapabilitiesGuard`.
Coexiste con RolesGuard (RolesGuard = identidad mínima; CapabilitiesGuard = permiso granular por módulo+acción).
Aplica sin re-login — el token solo lleva el rol; el mapa de permisos se resuelve en BD/Redis.

### Document Sharing (módulo ✅ 2026-06-18 — enlace público + código 6 dígitos + cédula)

| Endpoint                                             | Método | Auth                   | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/consultations/:id/share`                       | POST   | AppAuthGuard (doctor)  | Body: `{ sections: { report, prescriptions, ehr } }` (al menos 1 true) **+ (2026-07-10) `doc_selection: { types[], informeBlockKeys[], restContent? }`** (los 5 tipos de documento del modal rediseñado). **Guard: si el paciente no tiene cédula → 422 `PATIENT_CEDULA_REQUIRED_FOR_SHARING`**. Respuesta `{ success, data:{ url, code, expiresAt } }`. Email fire-and-forget.                                                                                                                                                           |
| `/api/documents/:token/render-data?sessionToken=...` | GET    | Pública (sessionToken) | **(2026-07-10, #29)** Valida sessionToken (mismo HMAC que download, vía `SessionTokenValidatorService`). Devuelve `{ success, data: DocumentRenderData }` con datos EN VIVO: consulta (blocksSnapshot), `consultationBlocks` (key/label/printable/sortOrder), patient (fullName/cedula), doctor (fullName/specialty/license/logoUrl/signatureUrl firmadas), `prescriptions[]`, **`ehrRecords[]` del PACIENTE** (`findByPatient`), `templateConfig` informe, `docSelection`, `sections`. Audit log. NO genera PDF — lo renderiza el front. |
| `/api/documents/:token/verify-code`                  | POST   | Pública                | Body: **`{ code: string, cedula: string }`** — código 6 dígitos **Y** cédula deben matchear al paciente del enlace. Cédula normalizada (sin espacios/guiones/puntos, uppercase → tolerante a V/E/P). Anti-bruteforce (5 intentos, incrementa ambos contadores). Respuesta: `{ sessionToken, sections, expiresAt }`. Cualquier mismatch → mismo 422 genérico (anti-oracle).                                                                                                                                                                |
| `/api/documents/:token/download?sessionToken=...`    | GET    | Pública (sessionToken) | Query param **`sessionToken`** (NO `session`). Valida HMAC-SHA256 (15min TTL, sin DB). Genera PDF (pdf-lib, A4). Content-Type: application/pdf, Cache-Control: no-store. sessionToken ausente → 400.                                                                                                                                                                                                                                                                                                                                      |
| `/api/documents/:token/request-code`                 | POST   | Pública                | Genera nuevo código 6 dígitos (invalida el anterior), re-envía email fire-and-forget. Cooldown 60s → 429. Respuesta: `{ expiresAt }`.                                                                                                                                                                                                                                                                                                                                                                                                     |

> Session token format: `base64url(JSON({linkId, token, exp})).<hex_HMAC_SHA256>`. Firmado con `AUTH_RESOLVE_SECRET`.
> Todos los errores en superficies públicas son genéricos (404 anti-enumeración). Nunca loguear PHI/code/token.
>
> **(2026-07-10, #29 — ADR-020) Descarga del paciente = MISMO PDF branded que el doctor, EN VIVO.** El viewer
> `/documents/[token]` ahora descarga vía la **ruta Next `GET /api/documents/[token]/pdf?sessionToken=`** (no la de
> backend `/download`): pide `render-data` al backend, arma el contenido con `consultation-documents.ts` y **renderiza
> `MedicalDocumentPdf` server-side con `@react-pdf/renderer` `renderToBuffer`** (runtime nodejs). Idéntico a la descarga
> del doctor + refleja ediciones posteriores. La ruta backend `/download` (pdf-lib) queda como legacy.

## Referencia: rutas API legacy (Next.js) a migrar

Las 64 rutas en `app/api/**/route.ts` son la fuente de la lógica a migrar. Por
módulo (ver `02-components.md`). A medida que cada módulo NestJS reemplace su
equivalente legacy, documentar aquí el endpoint nuevo y marcar el legacy como
deprecado.

| Endpoint NestJS | Método | Roles | Body | Caché | Reemplaza a (legacy) |
| --------------- | ------ | ----- | ---- | ----- | -------------------- |
| _(pendiente)_   |        |       |      |       |                      |

## Módulos nuevos — EPIC eliminar Supabase (2026-06-05)

### `offices` — consultorios del doctor (mig 20260605000000)

Controller `@Controller('doctor/offices')`, `DevAuthGuard`, doctor-scoped anti-IDOR (doctorId = user.sub).
Tabla `doctor_offices` (name, address, city, phone, schedule JSONB [{day,enabled,start,end} con **day 0=Lunes**],
slot_duration, buffer_minutes, is_active).

| Endpoint                         | Método | Notas                                                                             |
| -------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `/api/doctor/offices`            | GET    | Lista offices del doctor (created_at asc).                                        |
| `/api/doctor/offices`            | POST   | Crea. Zod CreateOfficeDto (name req; schedule/slot_duration/buffer con defaults). |
| `/api/doctor/offices/:id`        | PUT    | Actualiza (ownership; cross-doctor → 404).                                        |
| `/api/doctor/offices/:id`        | DELETE | Elimina (204).                                                                    |
| `/api/doctor/offices/:id/toggle` | PATCH  | Alterna is_active.                                                                |

**`GET /api/booking/:doctorId/slots?date=YYYY-MM-DD` reconstruido:** genera slots desde los offices ACTIVOS del
doctor (no doctor_schedules). Para el weekday (offset day 0=Lunes vía `(getUTCDay+6)%7`), por cada office activo con
ese día enabled genera slots start→end paso `slot_duration+buffer`, une+dedup, marca occupied por citas activas.
Respuesta sin cambios `{date, slots:[{time, available}]}`. Frontend cableado: `/doctor/offices` (actions thin-proxy).

### `doctor-templates` — config plantillas PDF (mig 20260605000001)

Controller `@Controller('doctor/templates')`, `DevAuthGuard`, doctor-scoped. Tabla `doctor_templates`
(UNIQUE doctor_id+template_type; types: informe|recipe|prescripciones|reposo; logo_url/signature_url solo string,
uploads=Fase 5).

| Endpoint                              | Método | Notas                                                                 |
| ------------------------------------- | ------ | --------------------------------------------------------------------- |
| `/api/doctor/templates`               | GET    | Todas las plantillas del doctor (puede ser []).                       |
| `/api/doctor/templates/:templateType` | PUT    | Upsert por (doctor, type). Tipo inválido → 400 INVALID_TEMPLATE_TYPE. |

### `reminders` — recordatorios (mig 20260605000002) ✅ — envío=bloqueante Fase 6

Tablas `reminders_settings` (UNIQUE doctor_id) + `reminders_queue` (monitor, vacía en Etapa 1).
Doctor `@Controller('doctor/reminders')`: GET/PUT `/settings` (upsert), GET `/queue`.
Admin `@Controller('admin/reminders')` super_admin: GET `/queue` enriquecido con doctor_name — **NUNCA expone PII
de pacientes** (no descifra patient.full_name). Verificado lead: 1311 tests, boot, curl+anti-IDOR+RBAC 403.
Frontend: `/admin/reminders` (monitor) cableado. `/doctor/reminders` (envío manual wa.me/mailto) NO usa este módulo
→ es consultas+citas PII (Fase 2). UI de settings (config 7d/24h) pendiente (Fase 2 doctor/settings).

#### Envío manual de recordatorio por email (2026-07-13) ✅

| Endpoint                           | Método | Auth                  | Notas                                                                                                                                                                                                                                  |
| ---------------------------------- | ------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/doctor/reminders/send-email` | POST   | AppAuthGuard (doctor) | Envía recordatorio branded al paciente de una cita. Body Zod (mínimo 1 campo): `{ appointment_id?: uuid, consultation_id?: uuid }`. `appointment_id` toma precedencia. Respuesta: `{ success: true, data: { sent: true } }`. HTTP 200. |

**Body completo (Zod `SendAppointmentReminderDtoSchema`):**

```jsonc
{
  "appointment_id": "uuid", // opcional — usar este si lo tienes
  "consultation_id": "uuid", // fallback si no tienes appointment_id
  // al menos uno de los dos es obligatorio
}
```

**Errores controlados:**

- `404 REMINDER_APPOINTMENT_NOT_FOUND` — cita no encontrada o pertenece a otro doctor (anti-IDOR: mismo error que not-found).
- `422 REMINDER_PATIENT_EMAIL_MISSING` — el paciente no tiene correo registrado.

**Flujo interno:**

1. Si viene `appointment_id` → `findByIdForDoctor(id, doctorId)` (anti-IDOR).
2. Si solo viene `consultation_id` → `findById(consultationId, doctorId)` → extrae `appointmentId` → `findByIdForDoctor`.
3. Email: `appointment.patientEmail` (plaintext) → fallback `patients.email` (descifrado owner-scoped).
4. Nombre del doctor: `IDoctorProfileRepository.findByDoctorId(doctorId)` → fallback `"Su médico"`.
5. Llama `MailerService.sendTemplate('reminder_manual', email, { patient_name, doctor_name, date, time, service, code }, { type:'patient', id })`.
6. Fechas formateadas en `America/Caracas` (UTC-4), locale `es-VE`.

**Template `reminder_manual`** (mig `20260713000001`):

- Subject: `📅 Recordatorio de tu consulta - {{date}}`
- Placeholders: `{{patient_name}}`, `{{doctor_name}}`, `{{date}}`, `{{time}}`, `{{service}}`, `{{code}}`
- `service` = `appointment.planName` o `"Consulta médica"` como fallback
- `code` = `appointment.appointmentCode` o primeros 8 chars del UUID (mayúsculas) como fallback

**Anti-IDOR:** `doctorId` SIEMPRE de `user.sub` del token, nunca del body. Una cita de otro doctor devuelve el mismo 404.

## Módulo Doctor "vendible" — Fases 1–8 (2026-06-11 → 06-12)

> Endpoints añadidos al culminar el módulo doctor: planes parametrizables, registro/verificación,
> especialidades, agenda (bloqueos+horizonte), servicios por consultorio, Google/Meet, telemetría,
> verificación de credenciales (MPPS/SACS).

### Planes parametrizables (módulo `admin` ampliado)

| Endpoint                             | Método | Roles       | Notas                                                                                                                                                                                                                      |
| ------------------------------------ | ------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/plans`                   | GET    | super_admin | Catálogo de planes (incluye `role_key`, `is_permanent`, precios y features).                                                                                                                                               |
| `/api/admin/plans`                   | POST   | super_admin | Crea plan (Zod; transaccional).                                                                                                                                                                                            |
| `/api/admin/plans/:planKey`          | PUT    | super_admin | Actualiza plan (toggle is_active, metadatos).                                                                                                                                                                              |
| `/api/admin/plans/:planKey/config`   | PUT    | super_admin | Actualiza config del plan (role_key/is_permanent/sort_order).                                                                                                                                                              |
| `/api/admin/plans/:planKey/features` | PUT    | super_admin | Set de features del plan (incluye `ai_assistant`/`ai_transcription`/`ai_reports`). Transaccional.                                                                                                                          |
| `/api/admin/plans/:planKey/prices`   | PUT    | super_admin | Set de precios por período (monthly/quarterly/semiannual/annual). Transaccional.                                                                                                                                           |
| `/api/plans?role=doctor`             | GET    | **Pública** | Catálogo público (`/doctor/upgrade`, `/register`). Solo planes/precios activos; sin flags internos.                                                                                                                        |
| `/api/public/plans`                  | GET    | **Pública** | BFF Next (proxya `GET /api/plans`) para la **landing** (el iframe estático no puede pasar auth). Devuelve los 3 planes Free/Base/Plus con precios + features. Añadido 2026-07-17 (#1).                                     |
| `/api/booking/:doctorId/slots?date=` | GET    | **Pública** | BFF Next → backend `GET /api/booking/:id/slots`; desempaqueta `{data:{slots}}`→`{date,slots:[{time,available}]}`. **Faltaba** → BookingClient recibía HTML 404 y no marcaba ocupados/bloqueados. Añadido 2026-07-17 (#10). |
| `/api/doctor/features`               | GET    | doctor      | Features del plan v2: downgrade perezoso a Free al expirar (Free permanente, no pierde datos).                                                                                                                             |

> `plan-features`/`plan-features/:planKey/:featureKey` (toggle individual) siguen existiendo (sección Admin arriba).
> El gating del doctor = capacidades del ROL (role_capabilities) **∩** features del PLAN (plan_features). Módulo
> no habilitado por el plan → candado → `/doctor/upgrade`.

### Registro de doctor + verificación (módulos `doctor-registration` + `credential-verification`)

| Endpoint                                                | Método | Roles       | Notas                                                                                                |
| ------------------------------------------------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------- |
| `/api/doctor/registration`                              | POST   | doctor      | Alta de datos profesionales (mpps/colegiado) → `verification_status=pending` + email a super_admins. |
| `/api/admin/doctor-verifications`                       | GET    | super_admin | Lista de doctores por estado de verificación.                                                        |
| `/api/admin/doctor-verifications/:doctorId`             | PUT    | super_admin | Aprueba/rechaza (verified/rejected) + verified_at/verified_by.                                       |
| `/api/admin/doctor-verifications/:doctorId/verify-mpps` | POST   | super_admin | Verificación automática del MPPS vía SACS (xajax por cédula; async no bloqueante).                   |
| `/api/admin/doctor-verifications/:doctorId/credentials` | GET    | super_admin | Resultado de las verificaciones de credenciales del doctor (verificadores por credencial).           |

> Verificación NO restringe acceso aún (preparatorio). Verificador de colegiado = MANUAL (sin portal).

### Especialidades (módulo `specialties`)

| Endpoint                     | Método | Roles       | Notas                                                                             |
| ---------------------------- | ------ | ----------- | --------------------------------------------------------------------------------- |
| `/api/specialties`           | GET    | **Pública** | Catálogo (seed 29). Consumido en registro/onboarding.                             |
| `/api/admin/specialties`     | GET    | super_admin | Lista TODAS (activas e inactivas) ordenadas por sortOrder. Para el mantenedor UI. |
| `/api/admin/specialties`     | POST   | super_admin | Crea especialidad (gestionable sin redeploy).                                     |
| `/api/admin/specialties/:id` | PUT    | super_admin | Edita especialidad (name/is_active/sort_order).                                   |

### Agenda — bloqueos + horizonte (módulo `availability-blocks` + `doctor-settings`)

| Endpoint                              | Método  | Roles  | Notas                                                                                |
| ------------------------------------- | ------- | ------ | ------------------------------------------------------------------------------------ |
| `/api/doctor/availability-blocks`     | GET     | doctor | Bloqueos de disponibilidad del doctor.                                               |
| `/api/doctor/availability-blocks`     | POST    | doctor | Crea bloqueo (ausencia/vacaciones). Anti-IDOR.                                       |
| `/api/doctor/availability-blocks/:id` | DELETE  | doctor | Elimina bloqueo (ownership).                                                         |
| `/api/doctor/schedule`                | GET/PUT | doctor | Ahora incluye `booking_horizon_weeks` (cuántas semanas adelante reserva el booking). |

> `GET /api/booking/:doctorId/slots` respeta los bloqueos y el horizonte de semanas.

### Servicios por consultorio (módulo `doctor-settings`)

| Endpoint                                | Método   | Roles  | Notas                                                                  |
| --------------------------------------- | -------- | ------ | ---------------------------------------------------------------------- |
| `/api/doctor/services?officeId=`        | GET      | doctor | Pricing plans filtrables por consultorio.                              |
| `/api/doctor/services`, `/services/:id` | POST/PUT | doctor | Create/update aceptan `office_id` (plan/cita asociados a consultorio). |

### Integraciones — Google Calendar/Meet (módulo `integrations`) — OPT-IN

| Endpoint                           | Método | Roles  | Notas                                                                  |
| ---------------------------------- | ------ | ------ | ---------------------------------------------------------------------- |
| `/api/integrations/google/status`  | GET    | doctor | Estado de la integración del doctor.                                   |
| `/api/integrations/google/connect` | POST   | doctor | Guarda tokens (cifrados) tras el OAuth. Habilita Meet en citas online. |
| `/api/integrations/google`         | DELETE | doctor | Desconecta Google.                                                     |

> OAuth en el **frontend**: `/api/integrations/google/auth` (inicio) + `/api/integrations/google/callback`
> (con cookie `state` CSRF, path `/`). Si el doctor NO conecta Google → fallback `.ics`/Jitsi + email (sin Meet).
> Citas: `appointments.meet_link` + `office_id`; modalidad por consultorio (in_person/online/both).

### Telemetría (módulo `telemetry`) — 1 fila por sesión

| Endpoint                  | Método | Roles       | Notas                                                                                                          |
| ------------------------- | ------ | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `/api/telemetry/session`  | POST   | doctor      | Upsert de la sesión (`telemetry_sessions`, 1 fila por session_id, `journey` jsonb). Guard anti-PII (PiiGuard). |
| `/api/telemetry/sessions` | GET    | super_admin | Lista de sesiones de telemetría.                                                                               |

> Reemplaza el modelo `action_events` (eliminado). Captura low-touch en el cliente (`TelemetryProvider`).

### Lote Fase 5 + MVP (2026-06-12) — endpoints nuevos

| Endpoint                          | Método | Roles       | Notas                                                                                                                                                                                                                                         |
| --------------------------------- | ------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| `/api/auth/login-touch`           | POST   | doctor/any  | "Login touch": setea `profiles.last_sign_in_at` y, si la suscripción venció (active/trial), degrada a `past_due` (subs+profiles+`subscription_changes_log`). Respeta planes permanentes. Anti-IDOR. Auth0 lo invoca desde `resolve-identity`. |
| `/api/admin/settings/rate-source` | POST   | super_admin | Fuente activa de tasa USD→Bs: `{ source: 'binance'\|'bcv'\|'manual', value? }`. Refresca y persiste.                                                                                                                                          |
| `/api/admin/settings/rates`       | GET    | super_admin | Resumen `{ source, manual, binance, bcv, effective }`. Binance P2P + BCV (dolarapi) + manual.                                                                                                                                                 |
| `/api/settings/usdt-rate`         | GET    | público     | Tasa efectiva `{ rate, source }`. Refresco PEREZOSO en `getRate()` (sin cron, TTL Redis 600s).                                                                                                                                                |
| `/api/settings/bcv-rate?date=`    | GET    | público     | **(2026-07-12)** Tasa BCV histórica para `date=YYYY-MM-DD`. Resolución: caché BD (`bcv_rate_history`) → pydolarve history API → tasa BCV actual (fallback). Devuelve `{rate,date,source}` donde source es `'cache'                            | 'pydolarve' | 'current-fallback'`. NUNCA lanza 500 por falla externa. Sin `date` usa hoy. |
| `/api/admin/doctors/export`       | GET    | super_admin | CSV de especialistas (`text/csv`, attachment). Estado Activo/Frío/Inactivo según `last_sign_in_at`.                                                                                                                                           |
| `/api/public/stats`               | GET    | público     | Conteos agregados `{ specialists, patients }` para el contador de la landing. NUNCA PII.                                                                                                                                                      |

> **Consultorio:** `PUT /api/consultations/:id` ahora acepta `blocks_snapshot` (JSONB) y el GET lo expone
> (bloques dinámicos editables persisten). **Cita:** `appointments.google_calendar_event_id` persiste el evento
> gcal (cancelable). **Recordatorio 30min:** Google event reminders + `VALARM` en el `.ics` (sin polling/WS).
>
> **⚠️ Convención de serialización (lección de QA 2026-06-12):** backend NestJS y BFF devuelven `envelope.data`
> en **camelCase** (`fullName`, `defaultLabel`, `blockKey`…). Los consumers frontend deben leer camelCase, no
> snake_case (causó 4 bugs del lote). Frontend route handler nuevo: `GET /api/doctor/patients/[id]`.

### IA — Transcripción de consultas (2026-06-16/17)

| Endpoint             | Método | Roles              | Notas                                                                                                                                                                                                                                                                                            |
| -------------------- | ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/ai/transcribe` | POST   | doctor/super_admin | Backend NestJS (módulo `ai-transcription`, DDD). multipart `audio` + opc. `available_blocks`(JSON)/`language`. Gating **FAIL-CLOSED** de `ai_transcription` (super_admin bypassa). Gemini (key en header, NUNCA URL). Audita `ai_request_log` (sin PHI). Devuelve `{ transcript, suggestions }`. |

> **Frontend:** `POST /api/doctor/consultations/transcribe` ahora es **proxy delgado** que reenvía el audio
> a `/api/ai/transcribe`. La `GEMINI_API_KEY` vive SOLO en el backend (Secret Manager). Gating de UI por plan
> (`useDoctorFeatures`): recorder→`ai_transcription`, panel Asistente IA→`ai_assistant`, Resumir informe→`ai_reports`.
> ⚠️ Free tier de Gemini = entrena con datos (riesgo PII aceptado por el usuario para arrancar).

### IA — Texto (reactivada 2026-06-18 · DESPLEGADA · 🚨 Gemini bloqueado)

| Endpoint       | Método | Roles              | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/ai/text` | POST   | doctor/super_admin | Backend NestJS — reusa infra de `ai-transcription` (adapter Gemini temp 0.3/maxOutput 2048, `ai_request_log`, gating por plan). Acciones: `improve_block` (gating `ai_assistant`), `summarize_report` (gating `ai_reports`), `patient_history` (gating `ai_assistant`), **`parse_prescription`** (gating `ai_assistant` — voz→récipe). Respuesta varía por acción (ver tabla abajo). DESPLEGADO (commit `b25522b`, 103 tests). 🚨 Gemini devuelve 403 "project denied access" → 502 hasta arreglar la key (ver memoria ia-gemini-decision). |

#### Acciones de `POST /api/ai/text`

| `action`             | Body requerido                           | Respuesta `data`                      | Feature gate   |
| -------------------- | ---------------------------------------- | ------------------------------------- | -------------- |
| `improve_block`      | `content, block_key, block_label, mode?` | `{ result: string }`                  | `ai_assistant` |
| `summarize_report`   | `legacy, blocks_data, blocks_meta`       | `{ result: string }`                  | `ai_reports`   |
| `patient_history`    | `patientId`                              | `{ result: string }`                  | `ai_assistant` |
| `parse_prescription` | `content` (texto de la transcripción)    | `{ medications: ParsedMedication[] }` | `ai_assistant` |

**`parse_prescription` — contrato para el frontend (2026-07-13):**

```jsonc
// Request
POST /api/ai/text
{ "action": "parse_prescription", "content": "Amoxicilina 500 mg vía oral cada 8 horas por 7 días en cápsulas..." }

// Response
{ "success": true, "data": { "medications": [
  { "name": "Amoxicilina", "dose": "500 mg", "route": "oral", "frequency": "cada 8 horas", "duration": "7 días", "presentation": "cápsulas" }
]}}
```

`ParsedMedication` shape: `{ name, dose, route, frequency, duration, presentation }` — todos `string`, campo no mencionado = `""`. Si el modelo responde JSON inválido o texto libre → `medications: []` (nunca 500). `content` vacío → 400. `super_admin` bypassa el gate.

> **Frontend:** `POST /api/doctor/ai` ya NO es stub 501 — proxea a `/api/ai/text` (valida rol; gating por plan +
> super_admin bypass se aplican en el backend con el plan efectivo). El frontend (`callAI`) lee `data.result` para
> acciones de texto o `data.medications` para `parse_prescription`.
> Prompts médicos en español. Marcar como **recién reactivado**.

### Ayuda — Chat asistente por perfil (2026-06-22)

| Endpoint         | Método | Roles                      | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/help/chat` | POST   | super_admin/doctor/patient | Backend NestJS, módulo **`help-assistant`** (DDD, sin BD ni persistencia). Body `{ messages:[{role:'user'\|'assistant', content}] }`. Selecciona el MANUAL por el **rol del CurrentUser** (server-side; el body NO elige guía): super_admin→admin, doctor→especialista, patient→paciente, otro→especialista. Reusa `GeminiTextAdapter` (`AI_TEXT_GENERATOR_PORT`). **SIN gating por plan** (ayuda para todos). Valida en boundary: ≤30 msgs, ≤4000 chars/msg (RECHAZA, no trunca), ≤24000 total, último=user. Responde `{ reply }`. Errores de proveedor → `HelpChatProviderError` 502 (sin PII en logs). |

> **Manuales** = strings TS en `apps/backend/src/modules/help-assistant/guides/{super-admin,specialist,patient}-guide.content.ts`
> (bundle-safe, sin backticks). Editar ahí para cambiar el conocimiento del chat. El prompt sanitiza delimitadores/falsos
> turnos del input del usuario (anti prompt-injection). ⚠️ Gemini free tier entrena con datos → el chat avisa "No
> ingreses datos de pacientes". **Frontend:** `POST /api/help/chat` = thin-proxy (`requireRole`). Widget global
> `components/help/HelpWidget.tsx` montado en el root `layout.tsx` (sobrevive la navegación; se resetea al cerrar);
> botón "Ayuda" (`HelpButton`) en los topbars de doctor/admin/patient; estado vía pub/sub `helpChatStore`.

### Lote 2026-07-12 — rutas nuevas / campos nuevos

> Route handlers Next (BFF), no NestJS: se migran acciones frecuentes o con polling desde Server Actions
> (cuyos IDs se rehashean por build → "Server Action not found" tras deploy). Ver ADR-022.

| Endpoint                           | Método    | Auth        | Notas                                                                                                                                                                                         |
| ---------------------------------- | --------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/recent-doctors?days=7` | GET       | super_admin | **Route handler** (reemplaza la Server Action `getRecentDoctors` del bell de admin — polling 60s generaba ~6000 "Server Action not found" en Sentry). Sobrevive deploys. Polling best-effort. |
| `/api/doctor/prescriptions`        | GET, POST | doctor      | **Route handler estable** (reemplaza la Server Action que truena tras deploy). GET `?patientId=`; POST acepta el campo nuevo `presentation`. Proxea al backend NestJS.                        |

**Campos nuevos (backend NestJS):**

- `prescriptions.presentation` (mig `20260712000005`) — presentación del medicamento (Tabletas, Cápsulas,
  Gotas, Jarabe, …, "Otro" libre). `GET/POST /api/prescriptions` lo exponen/aceptan (snake_case). Se renderiza
  en la hoja 2 "Indicaciones" del récipe (PDF de 2 hojas).
- `doctor_offices.map_url` (mig `20260712000003`) — enlace opcional de Google Maps del consultorio; `create`/
  `update` office lo aceptan (validado http/https, sanitizado). Se envía al paciente en el correo de
  confirmación de la cita ("Ver ubicación en el mapa").
- `GET /api/booking/:id/info` ahora incluye **`paymentDetails`** (nro de cuenta, Pago Móvil, etc.) — antes el
  backend los omitía; se muestran en el link público de reserva.
- `consultation_block_catalog.default_label`: bloque **"Indicaciones" → "Evaluación actual"** (mig
  `20260712000006`). ⚠️ Esa migración también intentaba `SET updated_at=NOW()` pero la tabla NO tiene esa
  columna → bloqueaba todos los deploys; corregida en `4b4fbf1`.
- Plantilla de email `welcome` enriquecida (paso a paso de onboarding, mig `20260712000002`) — se envía al
  especialista en su PRIMER registro.

### Recordatorios automáticos + confirmación de cita por token (2026-07-20)

- `POST /api/cron/appointment-reminders` — **solo cron** (Cloud Scheduler `*/15`). Sin auth de usuario;
  `CronSecretGuard` exige header `x-cron-secret` === `CRON_SECRET` (fail-closed → 403 si falta/no coincide).
  Backend `--no-allow-unauthenticated` → el Scheduler usa OIDC (`delta-backend-sa`). Respuesta
  `{success:true,data:{sent24h,failed24h,sent1h,failed1h}}`. Idempotente por `UNIQUE(appointment_id,offset_type)`.
- `GET /api/public/appointments/confirm-info?token=…` — **público** (sin auth). Devuelve
  `{status,doctorName,date,time,modality}` (sin PII) para la página de confirmación. Token inválido → **404**.
- `POST /api/public/appointments/confirm` `{token}` — **público**. Transiciona `scheduled→confirmed`
  (idempotente; terminal/confirmed devuelven estado actual sin error). Token inválido → 404.
- BFF: `/api/public/appointments/confirm-info` y `/confirm` (thin-proxy, sin headers de auth); página
  `/cita/confirmar/[token]`. Token = HMAC-SHA256 namespaced (`appt-confirm:v1:` + AUTH_RESOLVE_SECRET).

## Cambios de contrato (2026-07-25/26)

### `GET /api/public/specialties` (BFF, público, sin auth)

Proxy de `GET /api/specialties` del backend para **Client Components**. Responde
`{ specialties: [{ id, name }] }`; degrada a `[]` si el backend falla (la UI cae al campo
de texto libre). `Cache-Control: public, max-age=300`.

### `PUT /api/doctor/profile` — campos nuevos

El DTO `UpdateDoctorProfileDtoSchema` es **`.strict()`**: todo campo nuevo debe declararse
ahí o el PUT responde **400 por clave no reconocida**.

- `gender`: `'F' | 'M' | 'O' | 'N'` nullable opcional. Fines estadísticos; NO condiciona
  acceso, gating ni precios. Columna `profiles.gender` (mig `20260726000001`).
- `welcome_dismissed`: `boolean` opcional. El cliente solo manda la **intención**; el
  servidor sella `profiles.welcome_dismissed_at` con `NOW()` (mig `20260726000004`).

`GET /api/doctor/profile` devuelve además `gender` y `welcomeDismissedAt` (ISO o null).

### `POST /api/doctor/registration` — campo nuevo

- `gender`: `'F' | 'M' | 'O' | 'N'` nullable opcional (mismo DTO `.strict()`).

### Plantillas de correo (BD) — migraciones de contenido

- `20260726000002`: terminología "consulta médica" → "consulta" y "Médico:" →
  "Especialista:" sobre `subject/html/text`. Alcanza `reminder_manual`,
  `reminder_confirm_24h`, `reminder_1h`.
- `20260726000003`: quita la fila "ID del doctor" de `doctor_pending_verification`.

> Ambas usan `REPLACE`/`regexp_replace` sobre las columnas en vez de reinsertar la
> plantilla, para no pisar los restyles previos. **Validadas con `SELECT` contra la BD de
> staging ANTES de commitear** — una migración rota bloquea TODOS los despliegues.

---

## Lote agosto 2026 — WP-C (backend soporte transversal) — 2026-08-05

### Migración `20260805000001-lote-agosto-backend-support.cjs`

Añade a `profiles`:

- `consultation_blocks_layout TEXT NOT NULL DEFAULT 'tabs'` — layout del editor de bloques.
- `onboarding_completed_at TIMESTAMPTZ NULL` — timestamp del completado del onboarding gate.
- Backfill: `UPDATE profiles SET onboarding_completed_at = NOW() WHERE role='doctor' AND specialty IS NOT NULL AND onboarding_completed_at IS NULL`.

### `GET /api/doctor/consultation-blocks` — campo nuevo

Ahora incluye `layout: 'tabs' | 'vertical'` en la respuesta. Retrocompatible.

### `PUT /api/doctor/consultation-blocks` — campo nuevo

Acepta `layout?: 'tabs' | 'vertical'` (opcional). Si presente, persiste en `profiles.consultation_blocks_layout`. Si ausente, solo guarda los bloques (comportamiento anterior).

### `GET /api/appointments/:id` — enriquecido + anti-IDOR en repo

- Respuesta ahora incluye `officeName: string | null`.
- Anti-IDOR reforzado: `findByIdScopedEnriched(id, doctorId)` filtra por `doctor_id = :doctorId` en SQL WHERE (defensa en profundidad; antes: check a nivel use-case).
- Acceso owner-scoped: devuelve PII completo sin enmascarar, sin audit log (ADR-005). Los campos `consultationCode` y `officeName` vienen de JOIN a `consultations` y `doctor_offices`.

### `POST /api/appointments` — campo nuevo en respuesta

Ahora devuelve `consultationId: string | null` (vía `toPlainAppointment`). Antes devolvía la entidad cruda; ahora retorna el plain object mapeado.

### `POST /api/doctor/onboarding/complete` — endpoint nuevo

| Endpoint                          | Método | Auth   | Body | Errores                               |
| --------------------------------- | ------ | ------ | ---- | ------------------------------------- |
| `/api/doctor/onboarding/complete` | POST   | doctor | —    | `422 ONBOARDING_REQUIREMENTS_NOT_MET` |

Verifica server-side que el doctor tiene ≥1 consultorio activo Y ≥1 servicio activo. Si cumple, sella `profiles.onboarding_completed_at = NOW()` (idempotente). Respuesta: `{ onboardingCompleted: true }`.

### `POST /api/doctor/account/deactivate` — endpoint nuevo (2026-08-09)

| Endpoint                         | Método | Auth   | Body                        | Errores                                                                |
| -------------------------------- | ------ | ------ | --------------------------- | ---------------------------------------------------------------------- |
| `/api/doctor/account/deactivate` | POST   | doctor | `{ reason?: string\|null }` | `422 ACCOUNT_HAS_UPCOMING_APPOINTMENTS` · `422 CANNOT_DEACTIVATE_ROLE` |

El especialista da de baja su **propia** cuenta desde Configuración → Mi perfil.
Es una **desactivación, nunca un borrado**: toda la información queda bajo el mismo
`profile id` y un super_admin la reactiva desde `/admin/verifications`. Respuesta:
`{ deactivated: true }`.

- **Anti-IDOR:** el body NO lleva id — el objetivo sale siempre de `user.sub`.
- **Solo rol `doctor`:** un super_admin se encerraría fuera del panel que reactiva.
- **422 si hay citas a futuro** (el mensaje trae la cantidad): apagar la cuenta
  también baja el link público y deja sin acceso al único que podía cancelar.
- Reusa el flag ya existente `profiles.is_active`, que `AppAuthGuard` y el booking
  público ya respetan. La migración `20260809000001` agrega la **procedencia**:
  `deactivated_at`, `deactivated_by` (`'self'|'admin'`, con CHECK) y
  `deactivation_reason`.

**Código 403 nuevo — `ACCOUNT_DEACTIVATED`.** Convive con `ACCOUNT_BLOCKED` sobre el
MISMO flag; los distingue `deactivated_by`. Sin esta separación, a quien se dio de
baja solo se le decía que "fue bloqueado", que se lee como sanción. `AppAuthGuard`
elige uno u otro; el frontend lo propaga por `useAccountBlockedGuard` → pantalla del
portal → `/login?deactivated=1`.

### `GET /api/admin/doctor-verifications` — campos nuevos (2026-08-09)

Cada ítem agrega `isActive: boolean` (el panel ya lo consumía sin estar declarado) y
`deactivatedBy: 'self' | 'admin' | null`. La UI muestra "Se dio de baja" (ámbar) contra
"Acceso bloqueado" (rojo), y el botón dice "Reactivar cuenta" en vez de "Desbloquear
acceso" — el admin necesita saber qué está reactivando.

### `GET /api/doctor/profile` — campos nuevos

Ahora expone:

- `consultationBlocksLayout: 'tabs' | 'vertical'` — layout del editor.
- `onboardingCompletedAt: string | null` — ISO timestamp o null.
- `hasActiveOffice: boolean` — el doctor tiene ≥1 consultorio activo (enrichment en el GET, no columna directa).
- `hasActiveService: boolean` — el doctor tiene ≥1 servicio activo (enrichment en el GET).

### Seguridad — `BlockContentSanitizer` (módulo consultations)

`BlockContentSanitizer.sanitizeSnapshot()` limpia valores HTML en `blocks_snapshot` antes de persistir.

- Allowlist estricta: `p, br, strong, b, em, i, u, s, ul, ol, li, h1–h6, blockquote, pre, code, hr, span`.
- Zero atributos permitidos (onclick, style, href, src → todos eliminados).
- Cap de 300 000 chars serializado: lanza `BlocksSnapshotTooLargeError` (422) si excede.
- Invocado en `UpdateConsultationUseCase` antes de `repo.update()`.

### Utilidades HTML — `libs/shared-utils`

- `htmlToPlainText(input: string): string` — convierte HTML a texto plano (bloque→\n, li→"• item", entidades decodificadas). Sin dependencia de DOM.
- `isProbablyHtml(input: string): boolean` — heurística por tag names (no dispara con `<3` ni `A < B`).
- Usadas en `GetDocumentRenderDataUseCase.plainTextSnapshot()` para limpiar `blocksSnapshot` antes del PDF render.

### `POST /api/cron/doctor-inactivity` — endpoint nuevo (2026-08-05)

Cron de reactivación por inactividad del especialista. Máquina a máquina, sin usuario.

| Endpoint                      | Método | Auth                                                          | Respuesta                                                      |
| ----------------------------- | ------ | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `/api/cron/doctor-inactivity` | POST   | `CronSecretGuard` (header `x-cron-secret`) + IAM de Cloud Run | `{ success: true, data: { sent10, sent15, skipped, failed } }` |

- Endpoint **separado** de `/api/cron/appointment-reminders`: este corre 1 vez al día, aquel cada 15 min.
- Solo devuelve contadores agregados — NUNCA PII.
- Idempotente vía `profiles.inactivity_notice_stage` (0/1/2): cada especialista recibe como
  máximo 2 correos por ciclo. El inicio de sesión resetea el estado.
- ⚠️ El backend solo acepta invocaciones de `delta-frontend-sa` y del `delta-backend-sa` del
  job de Cloud Scheduler. Una cuenta de persona recibe **401 de IAM de Cloud Run** (no de la
  app) al intentar llamarlo.

### `PUT /api/appointments/:id/status` — regla nueva (2026-08-05)

Cancelar una cita cuya consulta tiene el pago **aprobado** ahora falla:

```
409 { error: "Esta cita ya tiene un pago aprobado y no se puede cancelar. Para cambiar la
     fecha, usa la opción de reagendar — el pago se mantiene vinculado a la nueva fecha.",
     code: "APPOINTMENT_CANCEL_REQUIRES_RESCHEDULE" }
```

- Solo afecta la transición a `cancelled`. `confirmed` / `completed` / `no_show` no cambian.
- **No existen créditos ni saldos a favor del paciente** — descartado explícitamente por el
  dueño. La plata no se devuelve: se reagenda y el pago viaja con la cita, porque reagendar
  solo toca `scheduled_at` y deja intacto el vínculo cita↔consulta↔pago.
- Fail-open: si la cita no tiene consulta vinculada, la cancelación procede. Es regla de
  negocio, no de seguridad.
- El BFF `POST /api/doctor/appointment-status` propaga el 409 con su `code` para que la UI
  abra el flujo de reagendar en vez de mostrar un error crudo.

---

## Cambios de contrato (2026-08-12)

### `GET /api/doctor/offices` — el wire es camelCase, no snake_case

El controller devuelve la **entidad tal cual**: `slotDuration`, `bufferMinutes`, `isActive`,
`mapUrl`, `doctorId`. No hay mapper de presentación.

⚠️ `/doctor/services` leía `slot_duration` (snake_case) y por eso el campo era SIEMPRE
`undefined`: la regla de compatibilidad servicio↔consultorio comparaba contra 30 minutos fijos
para todos los consultorios. Corregido el 2026-08-12. La página `/doctor/offices` nunca tuvo el
problema porque consume el server action `listOffices()`, que sí mapea con `toView`.

**Regla:** si consumís este endpoint por `fetch` directo desde el browser (thin-proxy), leé
camelCase. Solo hay snake_case cuando pasás por un server action que mapea.

### `DayScheduleSchema` — duración por bloque (opcional)

Cada entrada de `schedule` acepta dos campos nuevos, ambos opcionales:

| Campo           | Tipo                | Sin valor                     |
| --------------- | ------------------- | ----------------------------- |
| `slotDuration`  | int 5–480 (minutos) | hereda `office.slotDuration`  |
| `bufferMinutes` | int 0–120 (minutos) | hereda `office.bufferMinutes` |

Sin migración: los horarios ya guardados no traen los campos y siguen valiendo. Presente pero
fuera de rango → el bloque entero se rechaza (`DaySchedule.validate` devuelve null). Ver ADR-028.

### `GET /api/consultations` y `GET /api/consultations/:id` — sesión del combo

La respuesta gana dos campos de solo lectura, poblados por JOIN:

| Campo                    | De dónde sale                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `session_number`         | `appointments.session_number` (null si la cita no es de un combo)                                  |
| `package_total_sessions` | `patient_packages.total_sessions` y, si no hay, `pricing_plans.sessions_count` por nombre del plan |

⚠️ En la BD real `appointments.package_id` viene **siempre NULL** y `patient_packages` está
**vacía**: el total sale del SERVICIO. Se resuelve con **subconsulta escalar**, no con JOIN, porque
un JOIN por nombre duplicaría la consulta si el especialista repite el nombre de un servicio.

### `GET /api/finances/income` — solo lo efectivamente cobrado

La rama de pagos ahora exige `status = 'approved'` **Y** cita confirmada/completada (o sin cita).
Lo pendiente y lo aprobado-sin-confirmar viven en Cobros y en el "Por ingresar" del resumen. El
filtro va con EXISTS (nunca JOIN) porque un pago puede cubrir varias citas. Ver ADR-029.

## Cambios de contrato del lote de la fundadora (2026-08-16)

### `PUT /api/appointments/:id/reschedule` — ahora acepta una cita en `no_show`

`RESCHEDULABLE_STATUSES` pasa de `{scheduled, confirmed}` a `{scheduled, confirmed, no_show}`.
`cancelled` y `completed` siguen dando `APPOINTMENT_NOT_RESCHEDULABLE` (409).

Al reagendar desde `no_show` la cita **vuelve a un estado vigente** con la misma regla de 3 días
de la creación: `confirmed` si la nueva fecha está a menos de 3 días, `scheduled` si no. En los
demás casos el estado no se toca. El `appointment_changes_log` guarda la transición REAL
(`no_show → confirmed|scheduled`), que es el único rastro de que el paciente faltó.

### `POST /api/appointments` — fecha pasada creada por el especialista nace `completed`

`computeInitialStatus` gana una rama previa a la auto-confirmación: actor `doctor`/`admin` +
`scheduled_at` anterior a ahora → `completed`. El booking público no cambia (siempre `scheduled`).
El backend nunca validó fechas pasadas, así que no hay validación nueva que sortear. Ver ADR-032.

### Finanzas — `no_show` cuenta como cita RESUELTA

El criterio COBRADA pasa a `a.status IN ('confirmed','completed','no_show')` en **los seis**
lugares que lo arman: `COBRADA` (constante), `getIncomeBreakdown`, `listIncomePaginated`,
la rama de aprobados de `listForDoctor`, `citaConfirmada` de `totalsForDoctor` y el resumen.
Antes solo estaban documentados tres (ADR-029) y los otros tres tenían la lista inline.

Además, la rama UNION de consultas pendientes sin fila en `payments` suma
`AND COALESCE(c.amount, a.plan_price, 0) > 0`: una consulta de monto 0 no tiene nada que cobrar
y no debe figurar en "Por cobrar". Ojo: `c.amount IS NULL` cae a `a.plan_price`, que sí puede ser
mayor a 0 y tiene que seguir apareciendo.

### `GET /api/doctor/pending-consultations/usage[?patient_id=]` — consumo de combos (NUEVO)

Solo lectura. Devuelve, por paciente y por servicio, cuánto se atendió y cuánto falta.
`patient_id` es **opcional**: sin él trae todos los pacientes del doctor en UNA consulta
agrupada (la lista de pacientes pinta una insignia por fila y trae hasta 100 por página —
de a uno sería un N+1). Con él, valida ownership del paciente (`PatientNotOwnedError`).

⚠️ **El wire de este módulo es `snake_case`** (mirá `toResponse` en su controller), a
diferencia de `offices` que manda camelCase. La mezcla de convenciones entre módulos es real:
**mirá el controller antes de escribir el tipo del cliente**, no asumas.

```json
{
  "success": true,
  "data": [
    {
      "patient_id": "…",
      "plan_name": "Terapia Completa",
      "total_sessions": 6,
      "attended": 2,
      "scheduled": 1,
      "no_show": 1,
      "pending_scheduling": 2
    }
  ]
}
```

| Campo                | Significado                                                          |
| -------------------- | -------------------------------------------------------------------- |
| `total_sessions`     | `pricing_plans.sessions_count`; **null** si el servicio ya no existe |
| `attended`           | citas `completed` — **lo único que consume sesión**                  |
| `scheduled`          | citas `scheduled`/`confirmed` (todavía no ocurrieron)                |
| `no_show`            | inasistencias; **NO consumen**, van en su propio balde               |
| `pending_scheduling` | filas de `pending_consultations` sin agendar                         |

Detalles que NO hay que romper:

- Las citas `cancelled` no cuentan en ningún balde, y las filas `scheduled` de
  `pending_consultations` tampoco: ya tienen su cita y se contarían **dos veces**.
- Se agrupa por `(patient_id, plan_name)` y **no** por `payment_id`, que llega null cuando el
  paquete lo carga el especialista a mano. Dos compras del mismo combo se suman en una fila.
- El total sale de una **subconsulta escalar**, no de un JOIN: el especialista puede repetir
  el nombre de un servicio y un JOIN por nombre duplicaría la fila (mismo criterio que ya usa
  el repositorio de consultas para este dato).
- Solo se devuelven combos de verdad (`sessions_count > 1` o con filas por agendar). Si no,
  cinco consultas sueltas de "Consulta general" saldrían como "5 atendidas de 1".

### `GET /api/booking/:doctorId/info` — divisa del especialista (2026-08-16)

Dos campos nuevos, **camelCase** como el resto de ese payload:

| Campo          | Tipo                           | Nota                                                    |
| -------------- | ------------------------------ | ------------------------------------------------------- |
| `currencyMode` | `usd_bcv \| eur_bcv \| custom` | `profiles.currency_mode`; null o valor raro → `usd_bcv` |
| `customRate`   | `number \| null`               | **solo** cuando el modo es `custom`; en los demás, null |

Existen porque la página pública NO tiene sesión: el hook del frontend consultaba el endpoint
autenticado de la preferencia, recibía 401 y caía a dólar oficial — el paciente veía otra divisa
y otro monto en bolívares que el especialista para el mismo servicio. Ver ADR-034.

⚠️ `profiles.custom_rate` es DECIMAL y **pg lo entrega como string**: hay que convertirlo con
`Number()` o el frontend recibe `"97.5"` donde espera un número.
