# SPEC — Desenmascarar PII para el doctor dueño (Etapa 1)

> Decisión de política del usuario (2026-06-09, ver 05-progress-log línea 1067).
> El doctor dueño debe ver a SUS pacientes en PLANO (backend descifra y devuelve plano
> al dueño; se confía en TLS + VPC de GCP para el transporte). NO es exposición a terceros:
> todos los endpoints ya son owner-scoped (doctorId del token, anti-IDOR).

## Alcance: SOLO backend (este módulo). El frontend lo cablea el lead.

### Regla de auditoría (decisión del usuario)
`access_audit_log` se MANTIENE, pero ahora se registra **SOLO en el detalle**:
- **1 fila** cuando el doctor abre la ficha completa de UN paciente: `GET /api/patients/:id`.
- `field_revealed = 'full_record'` (una sola fila, NO una por campo).
- Lista (`GET /api/patients`) y búsqueda (`GET /api/patients/search`) **NO** auditan.

## Cambios

### 1. `patients/presentation/mappers/patient.mapper.ts`
- `toPatientListItem`: devolver PII en PLANO (quitar `maskName/maskCedula/maskPhone/maskEmail`;
  usar `patient.fullName/cedula/phone/email` crudos).
- `toPatientDetail`: igual, PLANO.
- **Eliminar** `toPatientReveal` (queda idéntico a `toPatientDetail`).
- **Eliminar** las funciones helper de masking (`maskName`, `maskCedula`, `maskPhone`, `maskEmail`)
  si no quedan otros consumidores en el módulo.
- Actualizar el JSDoc de cabecera: ya no hay masking; PII en plano al dueño (owner-scoped), TLS/VPC.

### 2. `patients/application/use-cases/patients/get-patient.use-case.ts`
- Extender `GetPatientInput` con: `actorId: string; actorRole: string; ipAddress: string | null; userAgent: string | null`.
- Tras pasar el ownership check (`findById` scoped + `canBeAccessedBy`), insertar **1 fila** de auditoría:
  `patientRepo.logReveal({ actorId, actorRole, patientId: patient.id, fieldRevealed: 'full_record', ipAddress, userAgent })`.
- Mantener el manejo de errores: `logReveal` es fire-and-forget en errores (no romper la respuesta si falla el log).
  (Si hoy `reveal` hacía `await Promise.all`, aquí basta `await` de un solo insert dentro de try/catch que loguee warn — NUNCA PII — y no propague.)

### 3. `patients/presentation/controllers/patients.controller.ts`
- **Eliminar** el endpoint `GET :id/reveal` (`reveal()`), el import de `RevealPatientDataUseCase`
  y el parámetro del constructor.
- `findOne` (`GET /:id`): inyectar `@Req() req`, extraer `ip` (de `x-forwarded-for` → primer valor, fallback
  `req.socket.remoteAddress`) y `userAgent` (`req.headers['user-agent']`), y pasar
  `actorId: user.sub, actorRole: user.role, ipAddress, userAgent` a `getPatient.execute`.
  (Reusar exactamente la extracción de ip/ua que tenía `reveal()`.)
- `list` y `search`: sin cambios de auditoría; siguen usando `toPatientListItem` (ahora plano).
- Actualizar JSDoc (quitar "masked", indicar plano al dueño + audit en detalle).

### 4. `patients/application/use-cases/patients/reveal-patient-data.use-case.ts`
- **Eliminar** el archivo + su `.spec`.
- Quitar su registro de `patients.module.ts` (providers).

### 5. `messages/presentation/mappers/message.mapper.ts`
- `toThreadListItem` (o equivalente): `patientName` en PLANO (quitar `maskName`).
- Eliminar el helper `maskName` si queda sin uso. Actualizar JSDoc del mapper, controller y repo
  (quitar referencias a "masked").

### 6. cita-360 — `consultations` `list-consultations-with-patient`
- Verificar que ya devuelve PII en plano al dueño (según notas previas ya lo hace, doble scope anti-IDOR).
  Si por algún motivo enmascara, desenmascarar. Si ya está plano, NO tocar.

## Invariantes a CONSERVAR (no romper)
- **Anti-IDOR**: `findById(patientId, doctorId)` scoped + `canBeAccessedBy(doctorId)` → cross-doctor = 404.
- **Tabla `access_audit_log`** + modelo + método repo `logReveal`: se mantienen.
- **Admin solo-stats**: el área admin NUNCA recibe PII de pacientes (no se toca aquí).
- **NUNCA loguear PII** (cedula/phone/email/nombre/diagnóstico/etc.).
- DDD 4 capas; masking jamás en repo/use-case (ya no hay masking); inmutabilidad.

## Tests
- Borrar `reveal-patient-data.use-case.spec`.
- `get-patient.use-case.spec`: assert que se inserta 1 fila de audit (`fieldRevealed: 'full_record'`)
  tras ownership OK; y que cross-doctor (findById→null) lanza `PatientNotFoundError` sin audit.
- `patient.mapper.spec`: assert list/detail devuelven PII en PLANO (sin `***`).
- `message.mapper.spec`: assert nombre en plano.
- Suite completa verde, lint 0 (con `--max-warnings 0`), boot del dist OK.

## Verificación del LEAD (post-agente)
- `nx build backend` + `nx lint backend` (EXIT real) + `nx test backend` (EXIT real).
- Boot dist: `node dist/apps/backend/main.js`.
- curl real (doctor dev `00000000-0000-4000-8000-000000000001`):
  - `GET /api/patients` → PII en plano (sin `***`).
  - `GET /api/patients/:id` → plano + **fila nueva en access_audit_log** (verificar vía Postgres MCP).
  - `GET /api/patients/:id/reveal` → 404 (endpoint eliminado).
  - cross-doctor `:id` ajeno → 404.
- security-agent OBLIGATORIO (toca PII): 0 CRITICAL/HIGH antes de cerrar.
