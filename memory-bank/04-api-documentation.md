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

### Appointments (módulo ✅)

| Endpoint                       | Método | Notas                                                                                                                                                      |
| ------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/appointments`            | GET    | Lista paginada del doctor (filtros date_from/to, status, page, limit). PII enmascarada.                                                                    |
| `/api/appointments/:id`        | GET    | Detalle (ownership).                                                                                                                                       |
| `/api/appointments`            | POST   | Crear. Optimistic lock de paquetes; duplicado ±15min → AppointmentDuplicateError; slot ocupado → AppointmentConflictError.                                 |
| `/api/appointments/:id/status` | PUT    | Transición de estado (scheduled→confirmed→completed/no_show/cancelled) + audit en `appointment_changes_log`. Inválida → AppointmentInvalidTransitionError. |
| _(diferidos)_                  |        | `/slots` y `/reschedule` requieren tabla `doctor_schedule` (no existe aún).                                                                                |

### Patients (módulo ✅ — PII cifrada AES-256-GCM)

| Endpoint                   | Método | Notas                                                                                      |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| `/api/patients`            | GET    | Lista paginada MÍNIMA enmascarada (id, fullName, cedula, phone, email, source, createdAt). |
| `/api/patients/:id`        | GET    | Detalle (enmascarado, ownership).                                                          |
| `/api/patients/:id/reveal` | GET    | Plaintext + 1 fila por campo PII en `access_audit_log`.                                    |
| `/api/patients`            | POST   | Crear. Cédula duplicada/doctor → PatientAlreadyExistsError.                                |
| `/api/patients/:id`        | PUT    | Actualizar (recalcula search hashes).                                                      |
| `/api/patients/:id`        | DELETE | Soft delete (paranoid).                                                                    |
| `/api/patients/search?q=`  | GET    | Híbrido: hash exacto (cédula V-/E- o email) o substring in-app (nombre).                   |

### Consultations (módulo ✅ — campos clínicos cifrados)

| Endpoint                                | Método | Notas                                                                                                                                                                                                                                                 |
| --------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/consultations`                    | GET    | Lista paginada (filtros date_from/to ISO, payment_status pending/approved).                                                                                                                                                                           |
| `/api/consultations/:id`                | GET    | Detalle clínico descifrado (ownership).                                                                                                                                                                                                               |
| `/api/consultations/patient/:patientId` | GET    | Historial del paciente (ownership).                                                                                                                                                                                                                   |
| `/api/consultations/with-patient`       | GET    | **Billing:** consultas del doctor con patient_name/phone/email DESCIFRADOS (owner-scoped, mapper dedicado NO enmascarado). Declarado ANTES de `:id`. `?limit` máx 200. Anti-IDOR doble scope. ⚠️ expone PII al doctor dueño → revisar en QA security. |
| `/api/consultations`                    | POST   | Crea con `consultation_code` único DLT-YYYYMM-XXXX (retry ante colisión UNIQUE).                                                                                                                                                                      |
| `/api/consultations/:id`                | PUT    | Actualiza campos clínicos.                                                                                                                                                                                                                            |
| `/api/consultations/:id/payment`        | PUT    | Aprueba pago (pending→approved). Ya aprobado → PaymentAlreadyApprovedError.                                                                                                                                                                           |

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

| Endpoint                                 | Método | Notas                                                                                                                                       |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/booking/:doctorId/info`            | GET    | Datos públicos del doctor. 404 si no existe/inactivo (anti-enumeración).                                                                    |
| `/api/booking/:doctorId/plans`           | GET    | Pricing plans con `show_in_booking=true`.                                                                                                   |
| `/api/booking/:doctorId/packages?email=` | GET    | Saldo de paquetes del paciente por email (Zod email; no filtra PII).                                                                        |
| `/api/booking`                           | POST   | Crea cita pública: find-or-create paciente (PII cifrada) + cita + consumo de paquete en **transacción atómica**. Respuesta sin `patientId`. |
| _(diferidos Etapa 2)_                    |        | `/slots` (req. doctor_schedule); **Turnstile real + rate limiting** (hoy stub — go-live blocker).                                           |

### Finances (módulo ✅)

| Endpoint                              | Método | Auth                         | Notas                                                                                                            |
| ------------------------------------- | ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/api/finances/summary?month=YYYY-MM` | GET    | doctor                       | Resumen del mes (consultas aprobadas + transacciones). `net` con signo (puede ser negativo). month inválido→400. |
| `/api/finances/transactions`          | GET    | doctor                       | Lista paginada de ingresos/gastos.                                                                               |
| `/api/finances/income`                | POST   | doctor                       | Registrar ingreso manual (amount>0).                                                                             |
| `/api/finances/expense`               | POST   | doctor                       | Registrar gasto.                                                                                                 |
| `/api/settings/usdt-rate`             | GET    | **Pública**                  | Tasa USDT/Bs (Redis TTL 600s + fallback app_settings; null si no seteada).                                       |
| `/api/admin/settings/usdt-rate`       | POST   | **super_admin** (RolesGuard) | Actualiza tasa + invalida Redis. doctor→403.                                                                     |

### Doctor settings (módulo ✅)

| Endpoint                                           | Método              | Notas                                                                                   |
| -------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `/api/doctor/profile`                              | GET/PUT             | Perfil del doctor (incluye payment_details/payment_methods, solo del dueño).            |
| `/api/doctor/schedule`                             | GET/PUT             | Horario (default L-V 08:00-17:00 30min si no existe). PUT invalida Redis slots:{id}:\*. |
| `/api/doctor/features`                             | GET                 | Features del plan (Redis cache TTL 3600, degrada a DB si Redis cae).                    |
| `/api/doctor/subscription`                         | GET                 | Estado + `bannerLevel` (suspended/critical≤3d/warning≤7d/none).                         |
| `/api/doctor/services`, `/api/doctor/services/:id` | GET/POST/PUT/DELETE | Pricing plans del doctor (ownership).                                                   |
| _(diferido)_                                       |                     | `/doctor/templates` (req. tabla doctor_templates + PDF).                                |

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

| Endpoint                                                                    | Método  | Notas                                                                                          |
| --------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `/api/admin/dashboard`                                                      | GET     | KPIs (médicos por actividad, citas 30d, pacientes, suscripciones por vencer). Redis cache 300. |
| `/api/admin/doctors`, `/api/admin/doctors/:id`                              | GET     | Lista (filtros activity_status/subscription_status → 400 si inválido) + detalle.               |
| `/api/admin/doctors/:id/subscription`                                       | PUT     | Actualiza suscripción (Zod) + invalida cache.                                                  |
| `/api/admin/subscriptions`                                                  | GET     | Todas con filtros.                                                                             |
| `/api/admin/plans`, `/api/admin/plans/:planKey`                             | GET/PUT | Planes (toggle is_active, Zod).                                                                |
| `/api/admin/plan-features`, `/api/admin/plan-features/:planKey/:featureKey` | GET/PUT | Toggle feature (upsert + invalida features:{plan}).                                            |
| `/api/admin/patients`                                                       | GET     | Stats globales (solo counts, sin PII).                                                         |
| `/api/admin/settings`                                                       | GET     | Config general (no expone secretos).                                                           |

> Nota: `POST /admin/settings/usdt-rate` vive en el módulo finances (no duplicado). lastSignInAt/activity
> tracking llega en Fase 4 (auth).

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

| Endpoint                                   | Método | Notas                                                                                                                           |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `/api/finances/payments`                   | GET    | Lista del doctor con joins appointment+consultation. Filtros status/from_date/to_date. Forma = `PaymentRow` de lib/finances.ts. |
| `/api/finances/payments/totals`            | GET    | KPIs {approvedUsd,pendingUsd,approvedCount,pendingCount}.                                                                       |
| `/api/finances/payments/:id/status`        | PUT    | {status:'pending'\|'approved'}. Sincroniza `consultations.payment_status`.                                                      |
| `/api/finances/payments/:id/items`         | GET    | Line-items del pago.                                                                                                            |
| `/api/finances/payments/:id/items`         | POST   | {name,amount_usd,source_type?,source_id?}. Recalcula total + appointment.plan_price.                                            |
| `/api/finances/payments/:id/items/:itemId` | DELETE | Borra item + recalcula.                                                                                                         |

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

| Endpoint | Método | Notas |
| --- | --- | --- |
| `/api/doctor/offices` | GET | Lista offices del doctor (created_at asc). |
| `/api/doctor/offices` | POST | Crea. Zod CreateOfficeDto (name req; schedule/slot_duration/buffer con defaults). |
| `/api/doctor/offices/:id` | PUT | Actualiza (ownership; cross-doctor → 404). |
| `/api/doctor/offices/:id` | DELETE | Elimina (204). |
| `/api/doctor/offices/:id/toggle` | PATCH | Alterna is_active. |

**`GET /api/booking/:doctorId/slots?date=YYYY-MM-DD` reconstruido:** genera slots desde los offices ACTIVOS del
doctor (no doctor_schedules). Para el weekday (offset day 0=Lunes vía `(getUTCDay+6)%7`), por cada office activo con
ese día enabled genera slots start→end paso `slot_duration+buffer`, une+dedup, marca occupied por citas activas.
Respuesta sin cambios `{date, slots:[{time, available}]}`. Frontend cableado: `/doctor/offices` (actions thin-proxy).

### `doctor-templates` — config plantillas PDF (mig 20260605000001)

Controller `@Controller('doctor/templates')`, `DevAuthGuard`, doctor-scoped. Tabla `doctor_templates`
(UNIQUE doctor_id+template_type; types: informe|recipe|prescripciones|reposo; logo_url/signature_url solo string,
uploads=Fase 5).

| Endpoint | Método | Notas |
| --- | --- | --- |
| `/api/doctor/templates` | GET | Todas las plantillas del doctor (puede ser []). |
| `/api/doctor/templates/:templateType` | PUT | Upsert por (doctor, type). Tipo inválido → 400 INVALID_TEMPLATE_TYPE. |

### `reminders` — recordatorios (mig 20260605000002) ✅ — envío=bloqueante Fase 6

Tablas `reminders_settings` (UNIQUE doctor_id) + `reminders_queue` (monitor, vacía en Etapa 1).
Doctor `@Controller('doctor/reminders')`: GET/PUT `/settings` (upsert), GET `/queue`.
Admin `@Controller('admin/reminders')` super_admin: GET `/queue` enriquecido con doctor_name — **NUNCA expone PII
de pacientes** (no descifra patient.full_name). Verificado lead: 1311 tests, boot, curl+anti-IDOR+RBAC 403.
Frontend: `/admin/reminders` (monitor) cableado. `/doctor/reminders` (envío manual wa.me/mailto) NO usa este módulo
→ es consultas+citas PII (Fase 2). UI de settings (config 7d/24h) pendiente (Fase 2 doctor/settings).
