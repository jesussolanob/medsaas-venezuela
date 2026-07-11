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

| Endpoint                       | Método | Notas                                                                                                                                                      |
| ------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/appointments`            | GET    | Lista paginada del doctor (filtros date_from/to, status, page, limit). PII enmascarada.                                                                    |
| `/api/appointments/:id`        | GET    | Detalle (ownership).                                                                                                                                       |
| `/api/appointments`            | POST   | Crear. Optimistic lock de paquetes; duplicado ±15min → AppointmentDuplicateError; slot ocupado → AppointmentConflictError.                                 |
| `/api/appointments/:id/status` | PUT    | Transición de estado (scheduled→confirmed→completed/no_show/cancelled) + audit en `appointment_changes_log`. Inválida → AppointmentInvalidTransitionError. |
| _(diferidos)_                  |        | `/slots` y `/reschedule` requieren tabla `doctor_schedule` (no existe aún).                                                                                |

### Patients (módulo ✅ — PII cifrada AES-256-GCM)

| Endpoint                   | Método | Notas                                                                                                    |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `/api/patients`            | GET    | Lista paginada MÍNIMA enmascarada (id, fullName, cedula, phone, email, source, createdAt).               |
| `/api/patients/:id`        | GET    | Detalle (enmascarado, ownership).                                                                        |
| `/api/patients/:id/reveal` | GET    | Plaintext + 1 fila por campo PII en `access_audit_log`.                                                  |
| `/api/patients`            | POST   | Crear. **Cédula OBLIGATORIA** (min 5; falta → 400). Cédula duplicada/doctor → PatientAlreadyExistsError. |
| `/api/patients/:id`        | PUT    | Actualizar (recalcula search hashes). Cédula no-nullable (no se puede borrar; omitir = sin cambio).      |
| `/api/patients/:id`        | DELETE | Soft delete (paranoid).                                                                                  |
| `/api/patients/search?q=`  | GET    | Híbrido: hash exacto (cédula V-/E- o email) o substring in-app (nombre).                                 |

### Consultations (módulo ✅ — campos clínicos cifrados)

| Endpoint                                 | Método | Notas                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/consultations`                     | GET    | Lista paginada (filtros date_from/to ISO, payment_status pending/approved).                                                                                                                                                                                                                                                                                                              |
| `/api/consultations/:id`                 | GET    | Detalle clínico descifrado (ownership).                                                                                                                                                                                                                                                                                                                                                  |
| `/api/consultations/patient/:patientId`  | GET    | Historial del paciente (ownership).                                                                                                                                                                                                                                                                                                                                                      |
| `/api/consultations/with-patient`        | GET    | **Billing:** consultas del doctor con patient_name/phone/email DESCIFRADOS (owner-scoped, mapper dedicado NO enmascarado). Declarado ANTES de `:id`. `?limit` máx 200. Anti-IDOR doble scope. ⚠️ expone PII al doctor dueño → revisar en QA security.                                                                                                                                    |
| `/api/consultations`                     | POST   | Crea con `consultation_code` único DLT-YYYYMM-XXXX (retry ante colisión UNIQUE).                                                                                                                                                                                                                                                                                                         |
| `/api/consultations/:id`                 | PUT    | Actualiza campos clínicos.                                                                                                                                                                                                                                                                                                                                                               |
| `/api/consultations/:id/payment`         | PUT    | Aprueba pago (pending→approved). Ya aprobado → PaymentAlreadyApprovedError.                                                                                                                                                                                                                                                                                                              |
| `/api/consultations/:id/payment-details` | PATCH  | **(2026-07-10)** Edita detalles de pago: `payment_status`, `payment_method`, `payment_reference`, `payment_receipt_url`, `amount` (todos opcionales). Editable AUNQUE esté aprobado (sin PaymentAlreadyApprovedError). Semántica: ausente=no toca, `null`=limpia. Setea `payment_date` al aprobar. Columnas `payment_reference`+`payment_receipt_url` (mig `20260710000003`). Anti-IDOR. |

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

| Endpoint                                                    | Método | Auth                         | Notas                                                                                                                                                                                          |
| ----------------------------------------------------------- | ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/finances/summary?month=YYYY-MM`                       | GET    | doctor                       | Resumen del mes (consultas aprobadas + transacciones). `net` con signo (puede ser negativo). month inválido→400.                                                                               |
| `/api/finances/transactions`                                | GET    | doctor                       | Lista paginada de ingresos/gastos.                                                                                                                                                             |
| `/api/finances/income-transactions?month=YYYY-MM&limit=200` | GET    | doctor                       | (7.9) Ingresos manuales con `patientName` descifrado (owner-scoped; null si corrupto). Máx 200. Para gráficas fieles.                                                                          |
| `/api/finances/income`                                      | POST   | doctor                       | Registrar ingreso manual (amount>0). (7.9) Acepta `patientId?` y `relatedConsultationId?`: si viene consulta, el paciente se deriva de ella (anti-IDOR, ignora patientId); consulta ajena→404. |
| `/api/finances/expense`                                     | POST   | doctor                       | Registrar gasto.                                                                                                                                                                               |
| `/api/settings/usdt-rate`                                   | GET    | **Pública**                  | Tasa USDT/Bs (Redis TTL 600s + fallback app_settings; null si no seteada).                                                                                                                     |
| `/api/admin/settings/usdt-rate`                             | POST   | **super_admin** (RolesGuard) | Actualiza tasa + invalida Redis. doctor→403.                                                                                                                                                   |

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

| Endpoint                                   | Método | Notas                                                                                                                                                                                                                    |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/finances/payments`                   | GET    | Lista del doctor con joins appointment+consultation. Filtros status/from_date/to_date. Forma = `PaymentRow` de lib/finances.ts. (7.10) incluye `patient_phone` (texto plano, sin enmascarar) para el cobro por WhatsApp. |
| `/api/finances/payments/totals`            | GET    | KPIs {approvedUsd,pendingUsd,approvedCount,pendingCount}.                                                                                                                                                                |
| `/api/finances/payments/:id/status`        | PUT    | {status:'pending'\|'approved'}. Sincroniza `consultations.payment_status`.                                                                                                                                               |
| `/api/finances/payments/:id/items`         | GET    | Line-items del pago.                                                                                                                                                                                                     |
| `/api/finances/payments/:id/items`         | POST   | {name,amount_usd,source_type?,source_id?}. Recalcula total + appointment.plan_price.                                                                                                                                     |
| `/api/finances/payments/:id/items/:itemId` | DELETE | Borra item + recalcula.                                                                                                                                                                                                  |

> CreateBooking crea la fila `payments` (status pending) y enlaza `appointments.payment_id`.
> Diferido Fase 5: subida de comprobante (storage→GCS), realtime, PDF de recibo.

### Billing — suscripciones y facturación (módulo ✅ 2026-06-04)

#### Subscription Payments (admin)

| Endpoint                                       | Método | Roles       | Notas                                                                                                                                                                                     |
| ---------------------------------------------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/subscription-payments`             | GET    | super_admin | Lista pagos de suscripción. Query: `?status=pending\|approved\|rejected`, `?page`, `?limit`.                                                                                              |
| `/api/admin/subscription-payments/:id/approve` | PUT    | super_admin | Aprueba el pago. TRANSACCIONAL: marca payment approved + extiende subscriptions.current_period_end + sync profiles snapshot (status=active) + inserta subscription_changes_log. Sin body. |
| `/api/admin/subscription-payments/:id/reject`  | PUT    | super_admin | Rechaza el pago. Body: `{ reason?: string }`. Inserta subscription_changes_log.                                                                                                           |

> La extensión de suscripción parte de max(now, currentExpiresAt) + payment.duration_months.
> Lanza SubscriptionPaymentNotFoundError(404) y SubscriptionPaymentAlreadyResolvedError(422) si procede.
> Reemplaza: `app/api/admin/payments/route.ts` + `approve/route.ts` + `reject/route.ts`.

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

## Módulo Doctor "vendible" — Fases 1–8 (2026-06-11 → 06-12)

> Endpoints añadidos al culminar el módulo doctor: planes parametrizables, registro/verificación,
> especialidades, agenda (bloqueos+horizonte), servicios por consultorio, Google/Meet, telemetría,
> verificación de credenciales (MPPS/SACS).

### Planes parametrizables (módulo `admin` ampliado)

| Endpoint                             | Método | Roles       | Notas                                                                                               |
| ------------------------------------ | ------ | ----------- | --------------------------------------------------------------------------------------------------- |
| `/api/admin/plans`                   | GET    | super_admin | Catálogo de planes (incluye `role_key`, `is_permanent`, precios y features).                        |
| `/api/admin/plans`                   | POST   | super_admin | Crea plan (Zod; transaccional).                                                                     |
| `/api/admin/plans/:planKey`          | PUT    | super_admin | Actualiza plan (toggle is_active, metadatos).                                                       |
| `/api/admin/plans/:planKey/config`   | PUT    | super_admin | Actualiza config del plan (role_key/is_permanent/sort_order).                                       |
| `/api/admin/plans/:planKey/features` | PUT    | super_admin | Set de features del plan (incluye `ai_assistant`/`ai_transcription`/`ai_reports`). Transaccional.   |
| `/api/admin/plans/:planKey/prices`   | PUT    | super_admin | Set de precios por período (monthly/quarterly/semiannual/annual). Transaccional.                    |
| `/api/plans?role=doctor`             | GET    | **Pública** | Catálogo público (`/doctor/upgrade`, `/register`). Solo planes/precios activos; sin flags internos. |
| `/api/doctor/features`               | GET    | doctor      | Features del plan v2: downgrade perezoso a Free al expirar (Free permanente, no pierde datos).      |

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
| --------------------------------- | ------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/login-touch`           | POST   | doctor/any  | "Login touch": setea `profiles.last_sign_in_at` y, si la suscripción venció (active/trial), degrada a `past_due` (subs+profiles+`subscription_changes_log`). Respeta planes permanentes. Anti-IDOR. Auth0 lo invoca desde `resolve-identity`. |
| `/api/admin/settings/rate-source` | POST   | super_admin | Fuente activa de tasa USD→Bs: `{ source: 'binance'\|'bcv'\|'manual', value? }`. Refresca y persiste.                                                                                                                                          |
| `/api/admin/settings/rates`       | GET    | super_admin | Resumen `{ source, manual, binance, bcv, effective }`. Binance P2P + BCV (dolarapi) + manual.                                                                                                                                                 |
| `/api/settings/usdt-rate`         | GET    | público     | Tasa efectiva `{ rate, source }`. Refresco PEREZOSO en `getRate()` (sin cron, TTL Redis 600s).                                                                                                                                                |
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

| Endpoint       | Método | Roles              | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/ai/text` | POST   | doctor/super_admin | Backend NestJS — reusa infra de `ai-transcription` (adapter Gemini temp 0.3/maxOutput 2048, `ai_request_log`, gating por plan). Acciones: `improve_block` (gating `ai_assistant`), `summarize_report` (gating `ai_reports`), `patient_history` (gating `ai_assistant`). Respuesta `{ success, data:{ result } }`. DESPLEGADO (commit `b25522b`, 103 tests). 🚨 Gemini devuelve 403 "project denied access" → 502 hasta arreglar la key (ver memoria ia-gemini-decision). |

> **Frontend:** `POST /api/doctor/ai` ya NO es stub 501 — proxea a `/api/ai/text` (valida rol; gating por plan +
> super_admin bypass se aplican en el backend con el plan efectivo). El frontend (`callAI`) lee `data.result`.
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
