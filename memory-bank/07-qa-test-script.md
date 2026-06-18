# 07 — Mega Guion de Pruebas (QA) · Parte A (core)

> Guion de pruebas exhaustivo módulo por módulo para Delta Medical CRM en
> **producción**. Cada caso describe: precondición, pasos en el front (ruta + acción),
> resultado esperado en UI (toast/banner/estado vacío), verificación en BASE DE DATOS
> (tabla, WHERE, columnas, valores, y que no quede basura/huérfano), RBAC/anti-IDOR y
> edge cases. **Parte B** (resto de módulos) está en
> [`07b-qa-test-script-extra.md`](./07b-qa-test-script-extra.md).

## Propósito y alcance

- Detectar regresiones en prod (han aparecido: SQL inválido al crear citas, query param
  mal nombrado al descargar documentos, enlaces con `localhost`, onboarding repetido,
  planes inventados en booking).
- Cubrir CADA acción del usuario por módulo y verificar persistencia real en BD.
- Lo usa el **qa-agent** (semi-automático) y un humano (QA visual). No reemplaza tests
  unitarios; los complementa.

## Cómo usarlo

1. Abrí el harness de BD (sección siguiente) en una terminal aparte.
2. Por cada caso: ejecutá los pasos en el front, observá el resultado UI, corré la query
   de verificación. Marcá PASA/FALLA. Si FALLA, abrí issue con el id del caso (ej `AGENDA-03`).
3. Antes de cada release, corré la **Sección de regresión** (Parte B) entera.
4. Cerrá con el **Checklist de cierre** (Parte B).

## Entorno (producción)

| Recurso       | Valor                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| Frontend prod | `https://delta-frontend-knliodnwza-ue.a.run.app`                                            |
| Backend prod  | Cloud Run IAM-protegido (`--ingress=internal`); NO accesible por curl público               |
| Auth          | Auth0 (login real `lucas@deltasalud.app` super_admin). Doctor de prueba con rol `doctor`.   |
| BD prod       | Cloud SQL `sodium-shard-499116-r3:us-east1:delta-db`, database `deltamedical`, user `delta` |

> El backend NO se puede curl-ear desde afuera (IAM internal). La verificación de
> endpoints se hace vía el **frontend BFF** (route handlers en `app/api/**`) o vía
> **boot del dist en local**. La verificación de datos se hace contra la **BD de prod**
> con el cloud-sql-proxy (sección B).

---

## B) Harness de verificación contra BD de prod

> Reutilizable. Abrir el proxy en una terminal y dejarlo vivo; correr el script `pg`
> desde **la raíz del repo** (ahí vive el módulo `pg`).

### 1. Levantar cloud-sql-proxy (binario darwin.arm64)

```bash
/tmp/cloud-sql-proxy --port 5433 \
  --token "$(gcloud auth print-access-token)" \
  sodium-shard-499116-r3:us-east1:delta-db
```

### 2. Password de la BD

```bash
gcloud secrets versions access latest \
  --secret=DB_PASSWORD --project=sodium-shard-499116-r3
```

### 3. Plantilla de script de verificación (correr desde la raíz del repo)

```js
// guardar como /tmp/qa-check.js y correr: node /tmp/qa-check.js
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: '127.0.0.1',
    port: 5433,
    user: 'delta',
    password: process.env.DB_PASSWORD,
    database: 'deltamedical',
  });
  await c.connect();
  const { rows } = await c.query('SELECT 1 AS ok'); // reemplazar por la query del caso
  console.log(rows);
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
```

```bash
DB_PASSWORD="$(gcloud secrets versions access latest --secret=DB_PASSWORD --project=sodium-shard-499116-r3)" \
  node /tmp/qa-check.js
```

### REGLA CRÍTICA — NUNCA imprimir PII en texto plano

- PII de paciente PROHIBIDA en logs: `cedula`, `diagnosis`, `treatment`,
  `medication`/`medication_name`, `phone`, `email`, `full_name`.
- En `patients` esos campos están **cifrados AES-256-GCM** (no son legibles igual).
  Para verificar, chequear **presencia/longitud** (`length(cedula) > 0`,
  `cedula_search_hash IS NOT NULL`), nunca `SELECT cedula`.
- En `consultations`/`ehr_records`/`prescriptions` los campos clínicos están cifrados:
  verificar `length(diagnosis) > 60` (ciphertext base64) en vez de su contenido.
- En `appointments` los snapshots `patient_name/phone/email/cedula` son **plaintext**
  (decisión Fase 1); verificar solo `IS NOT NULL`, no imprimir el valor.

### Tablas reales (de migraciones, NO inventar)

`profiles · plan_configs · plan_features · plan_prices · plan_promotions · subscriptions ·
subscription_payments · subscription_changes_log · patients · patient_identities ·
pricing_plans · leads · patient_packages · appointments · appointment_changes_log ·
consultations · ehr_records · prescriptions · patient_messages · reminders_settings ·
reminders_queue · doctor_invitations · access_audit_log · active_sessions ·
financial_transactions · income_concepts · app_settings · consultation_payments ·
payments · payment_items · billing_documents · invoices · doctor_suggestions ·
consultation_block_catalog · doctor_consultation_blocks · specialty_default_blocks ·
role_capabilities · doctor_offices · doctor_templates · doctor_quick_items ·
email_templates · google_integrations · doctor_availability_blocks · specialties ·
credential_verifications · credential_verifiers · telemetry_sessions · ai_request_log ·
shared_document_links · document_access_codes`

---

## C) Guion por módulo (core)

> Convención: `doctorId` SIEMPRE de `user.sub` (anti-IDOR), nunca del body. Envelope
> `{ success, data }`. Serialización **camelCase** en `data` (lección QA 2026-06-12).

### 1. Auth / Identidad / Onboarding

Páginas: `/login`, `/register`, `/onboarding`, `/doctor/onboarding`, `/post-login`,
`/auth/callback`. BFF: `/api/onboarding`, `/api/auth/login-touch`, `/api/debug/whoami`.
Tablas: `profiles` (col `role`, `onboarding_completed`, `last_sign_in_at`,
`verification_status`, `birth_date`), `subscriptions`.

| Caso    | Precondición                                                 | Pasos front                                                   | Esperado UI                                                                                                            | Verificación BD                                                                                                                     | RBAC / seguridad                                  | Edge / errores                               |
| ------- | ------------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| AUTH-01 | Usuario super_admin Auth0                                    | Ir a `/login`, autenticar con `lucas@deltasalud.app`          | Redirige a `/admin` (o dashboard admin). Sin loop de login.                                                            | `SELECT role, last_sign_in_at FROM profiles WHERE email='lucas@deltasalud.app'` → `role='super_admin'`, `last_sign_in_at` reciente. | Token Auth0 válido; rol leído de BD, no del token | Token expirado → 401, vuelve a login         |
| AUTH-02 | Doctor recién logueado                                       | Login como doctor de prueba                                   | `last_sign_in_at` se actualiza (login-touch)                                                                           | `SELECT last_sign_in_at FROM profiles WHERE id=:doctorId` → cambió respecto al login previo. NO se crea fila duplicada.             | Anti-IDOR: solo afecta su propia fila             | —                                            |
| AUTH-03 | Doctor con `onboarding_completed=false`                      | Login → completar onboarding (`/doctor/onboarding`) → guardar | Toast "Perfil completado" / redirige al dashboard. **NO** vuelve a pedir onboarding en el siguiente login (REGRESIÓN). | `SELECT onboarding_completed FROM profiles WHERE id=:doctorId` → `true` tras guardar; sigue `true` en logins posteriores.           | Solo el dueño edita su perfil                     | Campos requeridos vacíos → validación inline |
| AUTH-04 | Doctor `onboarding_completed=true`                           | Login                                                         | Va directo al dashboard, **sin** pantalla de onboarding.                                                               | Sin cambios en `onboarding_completed`.                                                                                              | —                                                 | —                                            |
| AUTH-05 | Suscripción vencida (status active/trial, period_end pasado) | Login del doctor                                              | Banner de suscripción vencida; acceso degradado a Free.                                                                | `login-touch` → `subscriptions.status='past_due'` + fila en `subscription_changes_log`. Planes permanentes (Free) NO se degradan.   | Anti-IDOR                                         | Plan permanente → no degrada                 |
| AUTH-06 | Sesión inválida                                              | Manipular cookie / token y abrir `/admin`                     | Redirige a `/login` o `/auth/error`. No expone datos.                                                                  | —                                                                                                                                   | 401/403; no fuga de PII en error                  | —                                            |
| AUTH-07 | Cualquier rol                                                | `GET /api/debug/whoami`                                       | Devuelve `{ role, sub, roleMatches:true }`                                                                             | `profiles.role` coincide con el rol devuelto.                                                                                       | No expone secretos                                | —                                            |

### 2. Perfil / Settings del doctor

Páginas: `/doctor/settings`, `/doctor/settings/exchange-rate`,
`/doctor/settings/consultation-blocks`. BFF: `/api/doctor/profile`, `/api/doctor/schedule`,
`/api/doctor/exchange-rate`. Tablas: `profiles` (payment_methods, payment_details,
specialty, office_address, city, allows_online), `doctor_schedules`.

| Caso    | Precondición    | Pasos front                                                        | Esperado UI                                   | Verificación BD                                                                                                          | RBAC / seguridad        | Edge / errores                  |
| ------- | --------------- | ------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------- |
| PROF-01 | Doctor logueado | `/doctor/settings` → editar nombre/teléfono/especialidad → Guardar | Toast "Perfil actualizado"                    | `SELECT full_name, phone, specialty, updated_at FROM profiles WHERE id=:doctorId` → valores nuevos; `updated_at` cambió. | Solo dueño (`user.sub`) | Campos vacíos → validación      |
| PROF-02 | Doctor          | Agregar métodos de pago (Pago Móvil / Zelle) → Guardar             | Toast OK; chips de métodos visibles           | `payment_methods` (array) y `payment_details` (jsonb) contienen lo ingresado.                                            | Solo dueño              | JSON inválido → 400             |
| PROF-03 | Doctor          | `/doctor/schedule` (GET) primera vez                               | Muestra horario default L-V 08:00-17:00 30min | Si no existía fila → backend devuelve default (puede no persistir hasta PUT).                                            | —                       | —                               |
| PROF-04 | Doctor          | Editar horario + `booking_horizon_weeks` → Guardar                 | Toast "Horario guardado"                      | `doctor_schedules` fila del doctor con valores nuevos; Redis `slots:{id}:*` invalidado (slots recalculan).               | Solo dueño              | Horas solapadas/invalidas → 400 |
| PROF-05 | Doctor B        | Intentar GET/PUT del perfil de doctor A (manipular request)        | 403/404; sin datos de A                       | Ninguna fila de A modificada.                                                                                            | Anti-IDOR               | —                               |

### 3. Consultorios / Offices

Página: `/doctor/offices`. BFF: `/api/doctor/offices` (GET/POST), `/:id` (PUT/DELETE),
`/:id/toggle` (PATCH). Tabla `doctor_offices` (name, address, city, phone, schedule JSONB
`[{day,enabled,start,end}]` con **day 0=Lunes**, slot_duration, buffer_minutes, is_active).

| Caso   | Precondición     | Pasos front                                                                  | Esperado UI                                  | Verificación BD                                                                                                                                              | RBAC / seguridad  | Edge / errores                                          |
| ------ | ---------------- | ---------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------- |
| OFF-01 | Doctor           | `/doctor/offices` → "Nuevo consultorio" → nombre+dirección+horario → Guardar | Toast "Consultorio creado"; aparece en lista | `SELECT * FROM doctor_offices WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → name/address/schedule correctos; `is_active=true`; UNA sola fila nueva. | doctorId=user.sub | name vacío → 400                                        |
| OFF-02 | Office existe    | Editar dirección/horario → Guardar                                           | Toast OK; cambios visibles                   | Misma fila `id`, columnas actualizadas; no se duplica.                                                                                                       | ownership         | cross-doctor PUT → 404                                  |
| OFF-03 | Office activo    | Toggle (desactivar)                                                          | Switch a inactivo; ya no genera slots        | `is_active=false`. `GET /api/booking/:doctorId/slots` ya no incluye sus slots.                                                                               | ownership         | —                                                       |
| OFF-04 | Office sin citas | Eliminar                                                                     | Toast "Consultorio eliminado"; desaparece    | Fila borrada (204). No quedan FKs huérfanas (pricing_plans.office_id / appointments.office_id quedan SET NULL o se valida).                                  | ownership         | Con citas asociadas → revisar comportamiento (SET NULL) |
| OFF-05 | Doctor B         | DELETE/PUT del office de doctor A                                            | 404                                          | Office de A intacto.                                                                                                                                         | Anti-IDOR         | —                                                       |

### 4. Servicios / Planes de precio (pricing_plans)

Páginas: `/doctor/services`, `/doctor/plans`. BFF: `/api/doctor/services` (GET/POST),
`/:id` (PUT/DELETE), `?officeId=`. Tabla `pricing_plans` (name, price_usd,
duration_minutes, sessions_count, type, show_in_booking, is_active, office_id).

| Caso   | Precondición | Pasos front                                                               | Esperado UI                       | Verificación BD                                                                                                                                                      | RBAC / seguridad  | Edge / errores  |
| ------ | ------------ | ------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------- |
| SVC-01 | Doctor       | `/doctor/services` → Nuevo → nombre+precio+duración+consultorio → Guardar | Toast "Servicio creado"           | `SELECT name, price_usd, duration_minutes, office_id, show_in_booking FROM pricing_plans WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → correctos; una fila. | doctorId=user.sub | precio ≤0 → 400 |
| SVC-02 | Plan existe  | Toggle `show_in_booking` off                                              | Switch off; no aparece en booking | `show_in_booking=false`. `GET /api/booking/:doctorId/plans` NO lo incluye.                                                                                           | ownership         | —               |
| SVC-03 | Plan existe  | Editar precio → Guardar                                                   | Toast OK                          | `price_usd` actualizado; `updated_at` cambió.                                                                                                                        | ownership         | —               |
| SVC-04 | Plan existe  | Eliminar                                                                  | Toast "Servicio eliminado"        | `is_active=false` (soft) o fila borrada según impl.; no rompe citas con `plan_name` snapshot.                                                                        | ownership         | —               |
| SVC-05 | Doctor B     | Editar/borrar plan de doctor A                                            | 404                               | Plan de A intacto.                                                                                                                                                   | Anti-IDOR         | —               |

### 5. Agenda / Citas (appointments) ⚠️ módulo con regresión histórica

Páginas: `/doctor/agenda`. BFF: `/api/doctor/appointments` (GET/POST),
`/api/doctor/appointment-status` (PUT), `/api/doctor/reschedule`,
`/api/doctor/availability-blocks`. Tablas: `appointments` (doctor*id, patient_id,
scheduled_at, status, duration_minutes, plan_name, plan_price, payment_id,
google_calendar_event_id, office_id, meet_link, snapshots plaintext patient*\*),
`appointment_changes_log`, `doctor_availability_blocks`.

| Caso      | Precondición                     | Pasos front                                                                  | Esperado UI                                     | Verificación BD                                                                                                                                                                                                                                                        | RBAC / seguridad  | Edge / errores                                          |
| --------- | -------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------- |
| AGENDA-01 | Doctor con consultorio+horario   | `/doctor/agenda` → "Nueva cita" → paciente + fecha/hora + servicio → Guardar | Toast "Cita creada"; aparece en la grilla       | **REGRESIÓN**: `SELECT id, scheduled_at, status, duration_minutes FROM appointments WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → fila nueva, `status='scheduled'`. NO error SQL (overlap usa `status IN (:activeStatuses)`, ya corregido el `ANY` inválido). | doctorId=user.sub | —                                                       |
| AGENDA-02 | Cita en slot X                   | Crear otra cita misma hora mismo doctor                                      | Error "Horario ocupado" (toast/banner), NO crea | No se inserta 2ª fila; índice `appointments_doctor_slot_uq` o `hasOverlap` bloquea.                                                                                                                                                                                    | —                 | Slot ocupado → AppointmentConflictError                 |
| AGENDA-03 | Cita reciente del mismo paciente | Crear cita duplicada ±15min                                                  | Error "Cita duplicada"                          | No se crea; AppointmentDuplicateError.                                                                                                                                                                                                                                 | —                 | —                                                       |
| AGENDA-04 | Cita `scheduled`                 | Cambiar estado → confirmed → completed                                       | Estado actualizado en UI (badge)                | `appointments.status` transiciona; 1 fila por cambio en `appointment_changes_log`.                                                                                                                                                                                     | ownership         | Transición inválida → AppointmentInvalidTransitionError |
| AGENDA-05 | Cita `scheduled`                 | Marcar no_show / cancelled                                                   | Badge actualizado                               | `status='no_show'`/`'cancelled'`; log registrado; el slot vuelve a estar libre (índice parcial no lo cuenta).                                                                                                                                                          | ownership         | —                                                       |
| AGENDA-06 | Doctor con Google conectado      | Crear cita online                                                            | Muestra link de Meet                            | `appointments.google_calendar_event_id` y `meet_link` NO nulos. Sin Google → fallback `.ics`/Jitsi (sin event_id).                                                                                                                                                     | ownership         | —                                                       |
| AGENDA-07 | Doctor                           | Crear bloqueo de disponibilidad (vacaciones)                                 | Toast "Bloqueo creado"; agenda muestra bloqueo  | `SELECT * FROM doctor_availability_blocks WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → rango correcto. `booking/slots` respeta el bloqueo.                                                                                                                   | doctorId=user.sub | rango inválido → 400                                    |
| AGENDA-08 | Bloqueo existe                   | Eliminar bloqueo                                                             | Desaparece                                      | Fila borrada; slots vuelven a aparecer.                                                                                                                                                                                                                                | ownership         | cross-doctor → 404                                      |
| AGENDA-09 | Doctor B                         | GET cita de doctor A (id directo)                                            | 404                                             | Sin fuga de PII de A.                                                                                                                                                                                                                                                  | Anti-IDOR         | —                                                       |
| AGENDA-10 | Lista de citas                   | `/doctor/agenda` lista                                                       | PII de paciente **enmascarada** en la lista     | El BFF/listado no devuelve PII descifrada en lista (solo snapshots mínimos).                                                                                                                                                                                           | enmascarado PII   | Lista vacía → estado vacío "Sin citas"                  |

### 6. Consultas (consultations) + bloques + plantillas

Páginas: `/doctor/consultations`, `/doctor/consultations/[id]`, `/doctor/cita-360/[id]`,
`/doctor/settings/consultation-blocks`. BFF: `/api/doctor/consultations`,
`/api/consultations/[id]`, `/api/doctor/consultation-blocks`. Tablas: `consultations`
(consultation_code DLT-YYYYMM-XXXX, diagnosis/treatment/notes CIFRADOS, payment_status,
amount, blocks_snapshot JSONB), `doctor_consultation_blocks`, `consultation_block_catalog`,
`specialty_default_blocks`.

| Caso    | Precondición                      | Pasos front                                                        | Esperado UI                                          | Verificación BD                                                                                                                                                                                                         | RBAC / seguridad               | Edge / errores                |
| ------- | --------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------- |
| CONS-01 | Cita completada                   | `/doctor/cita-360/[id]` → llenar diagnóstico/tratamiento → Guardar | Toast "Consulta guardada"                            | `SELECT consultation_code, length(diagnosis) AS dl, payment_status FROM consultations WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → `consultation_code` ~`DLT-YYYYMM-XXXX` único; `dl>60` (cifrado); UNA fila. | doctorId=user.sub              | code colisión → retry interno |
| CONS-02 | Consulta existe                   | Abrir detalle                                                      | Campos clínicos DESCIFRADOS visibles al dueño        | `consultations.diagnosis` sigue cifrado en BD (no plaintext).                                                                                                                                                           | ownership; descifra solo dueño | —                             |
| CONS-03 | Consulta con bloques dinámicos    | Editar bloques del consultorio → Guardar                           | Bloques persisten al recargar                        | `blocks_snapshot` (jsonb) refleja los bloques; NO debe contener PHI estructurada fuera de los campos cifrados (revisar).                                                                                                | ownership                      | —                             |
| CONS-04 | Consulta `payment_status=pending` | Aprobar pago                                                       | Badge "Pagado"                                       | `consultations.payment_status='approved'`. Re-aprobar → PaymentAlreadyApprovedError.                                                                                                                                    | ownership                      | doble aprobación → 409/422    |
| CONS-05 | Doctor                            | Configurar bloques de consulta (`consultation-blocks`)             | Toast "Bloque guardado" (toast, NO alert)            | `doctor_consultation_blocks` fila por bloque; orden persistido.                                                                                                                                                         | doctorId=user.sub              | —                             |
| CONS-06 | Doctor B                          | GET consulta de doctor A                                           | 404                                                  | Sin fuga.                                                                                                                                                                                                               | Anti-IDOR                      | —                             |
| CONS-07 | Billing                           | `/api/consultations/with-patient`                                  | Lista con nombre/teléfono del paciente (uso billing) | ⚠️ expone PII al doctor DUEÑO; verificar doble scope owner. `?limit` máx 200.                                                                                                                                           | Anti-IDOR doble scope          | limit>200 → recortado         |

### 7. Pacientes (patients) + anti-IDOR + enmascarado PII

Páginas: `/doctor/patients`, `/doctor/patients/[id]` (legacy `/patient/[patientId]`).
BFF: `/api/doctor/patients`, `/api/doctor/patients/[id]`, `/api/patients`. Backend:
`/api/patients`, `/:id/reveal`, `/search?q=`. Tabla `patients` (full_name/cedula/phone/email
CIFRADOS + `*_search_hash`, soft delete paranoid, UNIQUE (doctor_id, email_search_hash)).

| Caso   | Precondición        | Pasos front                                                   | Esperado UI                                     | Verificación BD                                                                                                                                                                                                                                                   | RBAC / seguridad                  | Edge / errores                                      |
| ------ | ------------------- | ------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| PAT-01 | Doctor              | `/doctor/patients` → Nuevo → nombre+cédula+teléfono → Guardar | Toast "Paciente creado"                         | `SELECT length(full_name) AS n, length(cedula) AS c, cedula_search_hash, full_name_search_hash FROM patients WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → cifrados (len alto), hashes NO nulos; UNA fila. **NUNCA** `SELECT full_name/cedula` en claro. | doctorId=user.sub                 | cédula duplicada/doctor → PatientAlreadyExistsError |
| PAT-02 | Paciente existe     | Lista de pacientes                                            | PII **enmascarada** (ej `V-****567`, `Juan P.`) | El listado no devuelve PII en claro.                                                                                                                                                                                                                              | enmascarado obligatorio en listas | Lista vacía → "Sin pacientes"                       |
| PAT-03 | Detalle de paciente | Abrir detalle, pulsar "Revelar" un campo                      | Muestra el valor en claro                       | `SELECT field_revealed, actor_id, patient_id FROM access_audit_log ORDER BY created_at DESC LIMIT 1` → 1 fila por campo revelado, `field_revealed` ∈ whitelist.                                                                                                   | `/reveal` audita SIEMPRE          | —                                                   |
| PAT-04 | Paciente existe     | Editar nombre/email → Guardar                                 | Toast OK                                        | `*_search_hash` recalculados; `updated_at` cambió.                                                                                                                                                                                                                | ownership                         | —                                                   |
| PAT-05 | Paciente existe     | Eliminar                                                      | Toast "Paciente eliminado"; sale de la lista    | Soft delete: `deleted_at IS NOT NULL` (paranoid); sigue en BD, no en listados.                                                                                                                                                                                    | ownership                         | —                                                   |
| PAT-06 | Doctor B            | GET/reveal paciente de doctor A (id directo)                  | 404; sin datos                                  | Paciente de A intacto; NO se crea fila en `access_audit_log` por A.                                                                                                                                                                                               | Anti-IDOR fuerte                  | —                                                   |
| PAT-07 | Doctor              | Buscar por cédula exacta (`/search?q=V-12345678`)             | Devuelve match exacto                           | Búsqueda por hash exacto (cédula/email) o substring in-app (nombre); sin descifrar masa.                                                                                                                                                                          | ownership                         | sin match → lista vacía                             |

---

> Continúa en **[`07b-qa-test-script-extra.md`](./07b-qa-test-script-extra.md)**: EHR,
> prescripciones, finanzas, booking público, paquetes, suscripción/billing, compartir
> documentos, recordatorios, mensajes, CRM/leads, invitaciones, Google Calendar,
> verificación MPPS, panel admin, portal paciente, IA, **casos de regresión** y
> **checklist de cierre**.
