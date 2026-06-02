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

## Referencia: rutas API legacy (Next.js) a migrar

Las 64 rutas en `app/api/**/route.ts` son la fuente de la lógica a migrar. Por
módulo (ver `02-components.md`). A medida que cada módulo NestJS reemplace su
equivalente legacy, documentar aquí el endpoint nuevo y marcar el legacy como
deprecado.

| Endpoint NestJS | Método | Roles | Body | Caché | Reemplaza a (legacy) |
| --------------- | ------ | ----- | ---- | ----- | -------------------- |
| _(pendiente)_   |        |       |      |       |                      |
