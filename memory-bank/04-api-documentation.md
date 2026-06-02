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

| Endpoint                                | Método | Notas                                                                            |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| `/api/consultations`                    | GET    | Lista paginada (filtros date_from/to ISO, payment_status pending/approved).      |
| `/api/consultations/:id`                | GET    | Detalle clínico descifrado (ownership).                                          |
| `/api/consultations/patient/:patientId` | GET    | Historial del paciente (ownership).                                              |
| `/api/consultations`                    | POST   | Crea con `consultation_code` único DLT-YYYYMM-XXXX (retry ante colisión UNIQUE). |
| `/api/consultations/:id`                | PUT    | Actualiza campos clínicos.                                                       |
| `/api/consultations/:id/payment`        | PUT    | Aprueba pago (pending→approved). Ya aprobado → PaymentAlreadyApprovedError.      |

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

## Referencia: rutas API legacy (Next.js) a migrar

Las 64 rutas en `app/api/**/route.ts` son la fuente de la lógica a migrar. Por
módulo (ver `02-components.md`). A medida que cada módulo NestJS reemplace su
equivalente legacy, documentar aquí el endpoint nuevo y marcar el legacy como
deprecado.

| Endpoint NestJS | Método | Roles | Body | Caché | Reemplaza a (legacy) |
| --------------- | ------ | ----- | ---- | ----- | -------------------- |
| _(pendiente)_   |        |       |      |       |                      |
