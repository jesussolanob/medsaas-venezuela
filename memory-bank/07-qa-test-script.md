# 07 — Mega Guion de Pruebas (QA)

> Guion de pruebas exhaustivo módulo por módulo para Delta Medical CRM en
> **producción**. Cada caso describe: precondición, pasos en el front (ruta + acción),
> resultado esperado en UI (toast/banner/estado vacío), verificación en BASE DE DATOS
> (tabla, WHERE, columnas, valores, y que no quede basura/huérfano), RBAC/anti-IDOR y
> edge cases.

## Propósito y alcance

- Detectar regresiones en prod (han aparecido: SQL inválido al crear citas, query param
  mal nombrado al descargar documentos, enlaces con `localhost`, onboarding repetido,
  planes inventados en booking).
- Cubrir CADA acción del usuario por módulo y verificar persistencia real en BD.
- Lo usa el **qa-agent** (semi-automático) y un humano (QA visual). No reemplaza tests
  unitarios; los complementa.

## Cómo usarlo

1. Abrí el harness de BD (sección siguiente) en una terminal aparte.
2. **Toda corrida de QA se hace con DOS agentes en paralelo** (ver "Metodología de 2 agentes"
   abajo): uno maneja el front, otro verifica BD + logs. NO un solo agente haciendo ambas.
3. Por cada caso: el agente de front ejecuta los pasos y observa el resultado UI; el agente de
   verificación confirma persistencia en BD y ausencia de errores en logs. Marcá PASA/FALLA.
   Si FALLA, abrí issue con el id del caso (ej `AGENDA-03`).
4. Antes de cada release, corré la **Sección de regresión (D)** entera.
5. Cerrá con el **Checklist de cierre (E)**.

## Metodología de pruebas — DOS agentes en paralelo (OBLIGATORIO)

> Regla del usuario (2026-06-18): **cada vez que se prueba, deben correr 2 agentes en paralelo
> que se retroalimentan** — uno prueba el front y otro verifica, en paralelo, lo que va quedando
> en BD y en los logs de error. NUNCA un solo agente haciendo front + BD a la vez: se delega para
> cubrir mejor ambas áreas y que un área valide a la otra.

**Roles:**

- **Agente A — Front-tester** (usa Playwright MCP `mcp__playwright__*`). Ejecuta los pasos de cada
  caso en `https://delta-frontend-knliodnwza-ue.a.run.app`, observa toasts/banners/estados vacíos,
  captura el resultado de UI y los IDs/datos creados (código de consulta, hora de la cita, etc.).
  NO consulta la BD.
- **Agente B — Verificador BD + logs** (usa el harness de BD de la sección B + `gcloud logging` +
  Sentry MCP). Tras cada acción que A reporta, corre la query de verificación del caso (persistencia,
  no-duplicados, no-huérfanos, campos cifrados con longitud) y revisa que NO haya errores nuevos en
  los logs del backend/Sentry. NO maneja el navegador. NUNCA imprime PII (ver regla en sección B).

**Protocolo de retroalimentación (se comunican con SendMessage):**

1. El **lead** levanta el harness de BD, lanza A y B en paralelo y les pasa el lote de casos.
2. A ejecuta el caso N → envía a B: `caso=N, acción=..., datos=(código/hora/id sin PII), ts=HH:MM`.
3. B verifica en BD + logs → responde a A: `caso=N → PASA` o `FALLA: <motivo + query/loglínea>`.
4. Si **FALLA**: A reintenta / investiga en el front (revisa request en Network, reabre, etc.) y
   reporta de nuevo; B re-verifica. Se itera hasta PASA o hasta confirmar bug real.
5. B también detecta efectos colaterales que A no ve (filas huérfanas, doble inserción, error en
   logs aunque la UI mostró éxito) y se los comunica a A para re-probar.
6. El **lead** consolida el veredicto por caso, juzga falsos positivos y registra los bugs reales
   (agrega fila a la Sección D + caso al módulo). Hace los fixes/commits.

**Por qué:** la UI puede mostrar "éxito" mientras la BD no persistió (o persistió mal) o el backend
logueó un error 500 silencioso — exactamente los bugs que aparecieron en prod. Tener a B mirando BD
y logs **en paralelo y en diálogo con A** cierra ese hueco.

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

## C) Guion por módulo

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

### 8. EHR (ehr_records)

Página: `/doctor/ehr`. BFF/backend: `/api/ehr`, `/api/ehr/:id`, `/api/ehr/patient/:patientId`.
Tabla `ehr_records` (diagnosis/treatment_plan CIFRADOS; FK doctor/patient/consultation).

| Caso   | Precondición        | Pasos front                                                 | Esperado UI               | Verificación BD                                                                                                                                | RBAC                     | Edge                     |
| ------ | ------------------- | ----------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------ |
| EHR-01 | Paciente del doctor | `/doctor/ehr` → crear registro (diagnóstico/plan) → Guardar | Toast "Historia guardada" | `SELECT length(diagnosis), length(treatment_plan) FROM ehr_records WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → cifrados (len alto). | ParseUUIDPipe; ownership | patientId inválido → 400 |
| EHR-02 | Registro existe     | Editar                                                      | Toast OK                  | Misma fila, columnas actualizadas; no duplica.                                                                                                 | ownership                | —                        |
| EHR-03 | Doctor B            | GET `/api/ehr/patient/:patientId` de A                      | 404                       | Sin fuga.                                                                                                                                      | Anti-IDOR                | —                        |

### 9. Prescripciones / Recetas (prescriptions)

BFF/backend: `/api/prescriptions`, `/:id`, `/patient/:patientId`. Tabla `prescriptions`
(medication/dosage CIFRADOS — col es `medication`, NO `medication_name`).

| Caso  | Precondición        | Pasos front                                            | Esperado UI                | Verificación BD                                                                                                                | RBAC                                 | Edge                   |
| ----- | ------------------- | ------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ---------------------- |
| RX-01 | Paciente del doctor | Emitir receta (medicamento+dosis+frecuencia) → Guardar | Toast "Receta emitida"     | `SELECT length(medication), length(dosage) FROM prescriptions WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → cifrados. | create valida ownership del paciente | medication vacío → 400 |
| RX-02 | Receta existe       | Ver receta del paciente                                | Datos descifrados al dueño | medication sigue cifrado en BD.                                                                                                | ownership                            | —                      |
| RX-03 | Doctor B            | GET receta de paciente de A                            | 404                        | Sin fuga.                                                                                                                      | Anti-IDOR                            | —                      |

### 10. Finanzas (financial_transactions + income_concepts + payments)

Páginas: `/doctor/finances`, `/doctor/cobros`, `/doctor/billing`. BFF:
`/api/doctor/finances` (summary), `/finances/income`, `/finances/expense`,
`/finances/transactions`, `/finances/income-concepts`, `/finances/transactions/[id]`.
Tablas: `financial_transactions` (type income/expense CHECK, amount DECIMAL(12,2),
currency, related_consultation_id, concept_id, transaction_date), `income_concepts`
(doctor-scoped), `payments`+`payment_items` (fuente de verdad financiera),
`consultation_payments` (secundario).

| Caso   | Precondición       | Pasos front                                             | Esperado UI                  | Verificación BD                                                                                                                                      | RBAC              | Edge                 |
| ------ | ------------------ | ------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------- |
| FIN-01 | Doctor             | `/doctor/finances` → Registrar ingreso (monto+concepto) | Toast "Ingreso registrado"   | `SELECT type, amount, concept_id FROM financial_transactions WHERE doctor_id=:d ORDER BY transaction_date DESC LIMIT 1` → `type='income'`, amount>0. | doctorId=user.sub | amount ≤0 → 400      |
| FIN-02 | Doctor             | Registrar gasto                                         | Toast "Gasto registrado"     | Fila `type='expense'`. Summary `net` refleja (puede ser negativo).                                                                                   | doctorId=user.sub | —                    |
| FIN-03 | Doctor             | Crear concepto de ingreso editable                      | Aparece en el selector       | `SELECT * FROM income_concepts WHERE doctor_id=:d ORDER BY 1 DESC LIMIT 1` → fila nueva; UNA sola.                                                   | doctorId=user.sub | duplicado → manejar  |
| FIN-04 | Transacción existe | Eliminar transacción                                    | Sale de la lista             | Fila borrada; summary recalcula; no quedan items huérfanos.                                                                                          | ownership         | cross-doctor → 404   |
| FIN-05 | Doctor             | `/doctor/finances?month=YYYY-MM` (summary)              | Tarjetas ingresos/gastos/net | Summary = consultas aprobadas + transacciones del mes.                                                                                               | ownership         | month inválido → 400 |
| FIN-06 | Cita con pago      | `/doctor/cobros` → aprobar pago                         | Badge "Aprobado"             | `payments.status='approved'` y `consultations.payment_status='approved'` sincronizados (transacción).                                                | ownership         | —                    |
| FIN-07 | Pago aprobado      | Agregar line-item al pago                               | Total recalculado            | `payment_items` nueva fila; `payments.total` y `appointments.plan_price` recalculados.                                                               | ownership         | —                    |
| FIN-08 | Doctor B           | GET `/api/finances/transactions` de A                   | Solo ve las suyas            | Ninguna fila de A.                                                                                                                                   | Anti-IDOR         | —                    |

### 11. Booking público (sin auth) ⚠️ regresión "planes inventados"

Páginas: `/book/[doctorId]`. BFF: `/api/book`. Backend: `/api/booking/:doctorId/info`,
`/plans`, `/slots?date=`, `/packages?email=`, `POST /api/booking`. Tablas:
`appointments`, `patients` (find-or-create cifrado), `patient_packages`, `payments`.

| Caso    | Precondición                             | Pasos front                         | Esperado UI                                     | Verificación BD                                                                                                                            | RBAC / seguridad                  | Edge                         |
| ------- | ---------------------------------------- | ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------- |
| BOOK-01 | Doctor activo CON planes show_in_booking | Abrir `/book/[doctorId]`            | Lista de planes reales del doctor               | `GET /api/booking/:doctorId/plans` = filas `pricing_plans` con `show_in_booking=true`. **REGRESIÓN**: NUNCA mostrar planes inventados.     | público                           | —                            |
| BOOK-02 | Doctor SIN planes en booking             | Abrir `/book/[doctorId]`            | Estado vacío / sin planes (NO planes ficticios) | `plans` = `[]`. La UI no debe fabricar planes.                                                                                             | público                           | —                            |
| BOOK-03 | Doctor activo con horario                | Elegir fecha → ver slots            | Slots disponibles del día                       | `slots` derivados de offices ACTIVOS + horario + bloqueos + horizonte. Ocupados marcados `available:false`.                                | público                           | día sin atención → sin slots |
| BOOK-04 | Slot libre                               | Completar datos + reservar          | Confirmación "Cita reservada"                   | `appointments` nueva fila (status scheduled); `patients` find-or-create (PII cifrada); `payments` fila pending; respuesta SIN `patientId`. | público; no fuga PII en respuesta | datos inválidos → 400        |
| BOOK-05 | Paciente con paquete (por email)         | Reservar usando saldo de paquete    | "Sesión consumida"                              | `patient_packages.used_sessions` +1 (optimistic lock, sin doble consumo); `appointments.package_id` seteado.                               | público                           | sin saldo → error            |
| BOOK-06 | doctorId inexistente/inactivo            | Abrir `/book/[malId]`               | 404 (anti-enumeración)                          | No revela existencia.                                                                                                                      | anti-enumeración                  | —                            |
| BOOK-07 | Slot recién tomado                       | Dos reservas simultáneas mismo slot | La 2ª falla "Horario ocupado"                   | Solo 1 cita; índice/transacción atómica evita doble booking.                                                                               | —                                 | —                            |

### 12. Paquetes de paciente (patient_packages)

BFF/backend: `/api/doctor/patient-packages`, `/api/packages`, `/patient/:patientId`,
`POST /api/packages`. Tabla `patient_packages` (total_sessions, used_sessions, status
active/completed CHECK, purchased_amount_usd).

| Caso   | Precondición                  | Pasos front                               | Esperado UI            | Verificación BD                                                                                                                                                  | RBAC      | Edge                         |
| ------ | ----------------------------- | ----------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------- |
| PKG-01 | Paciente del doctor           | Crear paquete prepagado (N sesiones)      | Toast "Paquete creado" | `SELECT total_sessions, used_sessions, status FROM patient_packages WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → `used_sessions=0`, `status='active'`. | ownership | total ≤0 → 400               |
| PKG-02 | Paquete con 1 sesión restante | Consumir última sesión (vía booking/cita) | "Paquete completado"   | `used_sessions=total_sessions`, `status='completed'`; sin sobre-consumo.                                                                                         | —         | sin saldo → error            |
| PKG-03 | Doctor B                      | GET paquetes de paciente de A             | 404                    | Sin fuga.                                                                                                                                                        | Anti-IDOR | ParseUUIDPipe inválido → 400 |

### 13. Suscripción / Planes paramétricos (plan_configs + plan_features + plan_prices)

Páginas doctor: `/doctor/upgrade`, `/doctor/subscription` (estado). Admin:
`/admin/plans`, `/admin/plan-features`. BFF: `/api/doctor/subscription`,
`/api/doctor/features`, `/api/plans?role=doctor`, `/api/admin/plans*`. Tablas:
`plan_configs`, `plan_features`, `plan_prices`, `subscriptions`, `subscription_changes_log`.

| Caso   | Precondición              | Pasos front                                                 | Esperado UI                                                        | Verificación BD                                                                                      | RBAC                     | Edge       |
| ------ | ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------ | ---------- |
| SUB-01 | Doctor con plan           | `/doctor/subscription`                                      | Banner según `bannerLevel` (suspended/critical≤3d/warning≤7d/none) | `subscriptions.status`/`current_period_end` consistentes con el banner.                              | ownership                | —          |
| SUB-02 | Doctor                    | `/doctor/upgrade` muestra planes públicos                   | Planes/precios activos, sin flags internos                         | `/api/plans?role=doctor` = `plan_configs` activos + `plan_prices` activos. NO expone flags internos. | público                  | —          |
| SUB-03 | super_admin               | `/admin/plans` → toggle `is_active` de un plan              | Switch persiste                                                    | `plan_configs.is_active` cambió; `/api/plans` público refleja.                                       | super_admin (RolesGuard) | doctor→403 |
| SUB-04 | super_admin               | `/admin/plan-features` → toggle feature (ej `ai_assistant`) | Switch persiste                                                    | `plan_features` upsert (plan,feature_key,enabled); Redis `features:{plan}` invalidado.               | super_admin              | —          |
| SUB-05 | super_admin               | `/admin/plans/:planKey/prices` → set precios por período    | Toast OK                                                           | `plan_prices` filas monthly/quarterly/semiannual/annual (transaccional).                             | super_admin              | —          |
| SUB-06 | Doctor plan Plus → expira | Login tras expirar                                          | Acceso degradado a Free, datos intactos                            | `/api/doctor/features` v2: downgrade perezoso; Free permanente no pierde datos.                      | —                        | —          |

### 14. Billing / pagos de suscripción + facturas (admin)

Páginas: `/admin/subscriptions`, `/admin/aprobaciones`/`/admin/approvals`,
`/doctor/billing`. BFF/backend: `/api/admin/subscription-payments` (+approve/reject),
`/api/admin/invoices` (+`/:id/paid`), `/api/doctor/billing`. Tablas: `subscription_payments`,
`subscriptions`, `subscription_changes_log`, `invoices`, `billing_documents`.

| Caso    | Precondición                  | Pasos front                                | Esperado UI              | Verificación BD                                                                                                                                                                                    | RBAC              | Edge                 |
| ------- | ----------------------------- | ------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------- |
| BILL-01 | Pago de suscripción `pending` | `/admin/aprobaciones` → Aprobar            | Toast "Pago aprobado"    | TRANSACCIONAL: `subscription_payments.status='approved'` + `subscriptions.current_period_end` extendido (max(now,exp)+duration) + `profiles` snapshot active + fila en `subscription_changes_log`. | super_admin       | ya resuelto → 422    |
| BILL-02 | Pago `pending`                | Rechazar (motivo)                          | Toast "Pago rechazado"   | `status='rejected'`; fila en `subscription_changes_log`.                                                                                                                                           | super_admin       | id inexistente → 404 |
| BILL-03 | super_admin                   | `/admin` → crear factura para doctor       | Toast con número FAC-... | `invoices` fila, número `FAC-YYYYMMDD-XXXX`.                                                                                                                                                       | super_admin       | —                    |
| BILL-04 | Factura existe                | Marcar pagada                              | Badge "Pagada"           | `invoices` marcada paid (idempotente).                                                                                                                                                             | super_admin       | id inexistente → 404 |
| BILL-05 | Doctor                        | `/doctor/billing` → crear documento fiscal | Toast con número         | `billing_documents` fila, número `<TYPE>-YYYYMMDD-XXXX`; respuesta NO incluye `patient_id` (anti-PII).                                                                                             | doctorId=user.sub | —                    |
| BILL-06 | Doctor B                      | GET `/api/doctor/billing` de A             | Solo los suyos           | Ninguna fila de A.                                                                                                                                                                                 | Anti-IDOR         | —                    |

### 15. Compartir documentos (#12) ⚠️ regresión param + localhost

Páginas: `/documents/[token]` (público). BFF: `/api/consultations/[id]/share`,
`/api/documents/[token]/verify-code`, `/download`, `/request-code`. Tablas:
`shared_document_links` (token, sections JSONB, status active/revoked),
`document_access_codes` (code 6 dígitos, failed_attempts, used_at, expires_at).

| Caso    | Precondición                                            | Pasos front                                                     | Esperado UI                                  | Verificación BD                                                                                                                                                                                                     | RBAC / seguridad                          | Edge                           |
| ------- | ------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------ |
| DOC-01  | Consulta del doctor                                     | Detalle consulta → "Compartir" → elegir secciones → Generar     | Muestra URL + código 6 dígitos               | `shared_document_links` fila nueva (token 48 bytes, sections jsonb, status active); `document_access_codes` 1 código. Email fire-and-forget.                                                                        | doctor; ≥1 sección true                   | 0 secciones → 400              |
| DOC-02  | Enlace generado                                         | Inspeccionar la URL devuelta                                    | URL apunta al dominio prod, **NO localhost** | **REGRESIÓN**: `APP_BASE_URL`/`FRONTEND_URL` deben estar seteados en prod; fallback es `http://localhost:3000`. Validar que la URL = `https://delta-frontend-...run.app/documents/<token>`.                         | —                                         | env faltante → localhost (BUG) |
| DOC-03  | Paciente con enlace, código y cédula del paciente       | `/documents/[token]` → ingresar **cédula + código** → Verificar | Acceso concedido; muestra secciones          | `document_access_codes.used_at` seteado; devuelve `sessionToken` (HMAC, 15min). El backend exige que `code` Y `cedula` matcheen al paciente del link (cédula normalizada: sin espacios/guiones/puntos, mayúsculas). | pública; todos los errores → 422 genérico | código o cédula erróneos → 422 |
| DOC-03b | Paciente sin cédula registrada, o cédula que no matchea | Ingresar cédula incorrecta + código correcto                    | Error genérico "inválido"                    | Mismo 422 genérico (no revela cuál falló); incrementa AMBOS contadores anti-fuerza-bruta (`document_access_codes.failed_attempts` + link). Paciente con cédula nula → siempre falla.                                | anti-oracle                               | —                              |
| DOC-04  | Sesión verificada                                       | Pulsar "Descargar PDF"                                          | **Descarga un PDF** (no error)               | **REGRESIÓN**: el front llama `?sessionToken=...` (NO `?session=...`). `Content-Type: application/pdf`, `Cache-Control: no-store`.                                                                                  | valida HMAC sin DB                        | sessionToken faltante → 400    |
| DOC-05  | Código incorrecto x5                                    | Ingresar 5 códigos malos                                        | Bloqueado tras 5 intentos                    | `document_access_codes.failed_attempts >= 5`; verificación bloqueada.                                                                                                                                               | anti-bruteforce                           | —                              |
| DOC-06  | Enlace existe                                           | Pedir nuevo código (`request-code`)                             | "Código reenviado"                           | Nuevo `document_access_codes` (invalida el anterior); email reenviado.                                                                                                                                              | pública                                   | —                              |
| DOC-07  | Token inexistente                                       | Abrir `/documents/<random>`                                     | 404 genérico                                 | Sin fuga (anti-enumeración). NUNCA loguear code/token/PHI.                                                                                                                                                          | anti-enumeración                          | —                              |

### 16. Recordatorios (reminders)

Doctor: `/doctor/reminders` (settings + envío manual wa.me/mailto). Admin:
`/admin/reminders` (monitor). BFF/backend: `/api/doctor/reminders/settings`, `/queue`,
`/api/admin/reminders/queue`. Tablas: `reminders_settings` (UNIQUE doctor_id),
`reminders_queue` (status pending/sent/failed/skipped/cancelled).

| Caso   | Precondición | Pasos front                                       | Esperado UI            | Verificación BD                                                                               | RBAC                             | Edge |
| ------ | ------------ | ------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- | -------------------------------- | ---- |
| REM-01 | Doctor       | `/doctor/reminders` → settings (7d/24h) → Guardar | Toast OK               | `reminders_settings` upsert (1 fila por doctor; UNIQUE).                                      | doctorId=user.sub                | —    |
| REM-02 | super_admin  | `/admin/reminders` monitor                        | Cola con `doctor_name` | `/api/admin/reminders/queue` enriquece con doctor_name; **NUNCA** descifra patient.full_name. | super_admin; NO PII de pacientes | —    |

### 17. Mensajes (patient_messages)

Doctor: `/doctor/messages`. Paciente: `/patient/messages`. BFF/backend:
`/api/patient/messages` (GET/POST direction patient_to_doctor). Tabla `patient_messages`
(direction CHECK patient_to_doctor/doctor_to_patient).

| Caso   | Precondición          | Pasos front                          | Esperado UI        | Verificación BD                                                                           | RBAC                   | Edge               |
| ------ | --------------------- | ------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------- | ---------------------- | ------------------ |
| MSG-01 | Paciente con relación | `/patient/messages` → enviar mensaje | Mensaje en el hilo | `patient_messages` fila `direction='patient_to_doctor'`; valida relación paciente-doctor. | scope por auth_user_id | sin relación → 403 |
| MSG-02 | Doctor                | Responder al paciente                | Mensaje en el hilo | fila `direction='doctor_to_patient'`.                                                     | ownership              | —                  |

### 18. CRM / Leads (leads)

Página: `/doctor/crm`. BFF: `/api/doctor/...` (leads). Tabla `leads` (name, channel,
stage CHECK new/contacted/qualified/appointment/converted/lost, status hot/cold/client/archived).

| Caso   | Precondición | Pasos front                  | Esperado UI         | Verificación BD                                                                                      | RBAC              | Edge                       |
| ------ | ------------ | ---------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- | ----------------- | -------------------------- |
| CRM-01 | Doctor       | `/doctor/crm` → Nuevo lead   | Toast "Lead creado" | `SELECT name, stage FROM leads WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → `stage='new'`. | doctorId=user.sub | stage inválido → CHECK 400 |
| CRM-02 | Lead existe  | Mover de etapa (drag/select) | Columna actualizada | `leads.stage` actualizado; `leads_stage_check` permite el valor.                                     | ownership         | —                          |
| CRM-03 | Doctor B     | Ver/editar lead de A         | 404                 | Sin fuga.                                                                                            | Anti-IDOR         | —                          |

### 19. Integración Google Calendar (google_integrations)

BFF: `/api/integrations/google/auth` (inicio OAuth, cookie `state` CSRF),
`/callback`, `/sync`, `/status`, DELETE. Tabla `google_integrations` (tokens cifrados).

| Caso    | Precondición      | Pasos front                          | Esperado UI                         | Verificación BD                                                | RBAC / seguridad  | Edge                   |
| ------- | ----------------- | ------------------------------------ | ----------------------------------- | -------------------------------------------------------------- | ----------------- | ---------------------- |
| GCAL-01 | Doctor sin Google | `/doctor/settings` → Conectar Google | Redirige OAuth → vuelve "Conectado" | `google_integrations` fila con tokens CIFRADOS (no plaintext). | cookie state CSRF | state mismatch → error |
| GCAL-02 | Doctor con Google | Crear cita online                    | Link de Meet en la cita             | `appointments.meet_link`/`google_calendar_event_id` no nulos.  | ownership         | —                      |
| GCAL-03 | Doctor con Google | Desconectar                          | "Desconectado"                      | Fila eliminada/invalidada; nuevas citas → fallback `.ics`.     | ownership         | —                      |

### 20. Verificación de credenciales / MPPS (admin)

Páginas: `/admin/verifications`, `/doctor/registration` flow. BFF/backend:
`/api/doctor/registration`, `/api/admin/doctor-verifications` (+`/:id` PUT,
`/verify-mpps`, `/credentials`). Tablas: `profiles.verification_status`,
`credential_verifications`, `credential_verifiers`.

| Caso    | Precondición   | Pasos front                                      | Esperado UI            | Verificación BD                                                         | RBAC        | Edge                            |
| ------- | -------------- | ------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------- | ----------- | ------------------------------- |
| MPPS-01 | Doctor nuevo   | `/doctor/registration` → enviar MPPS/colegiado   | "Verificación enviada" | `profiles.verification_status='pending'`; email a super_admins.         | doctor      | —                               |
| MPPS-02 | Doctor pending | `/admin/verifications` → Aprobar                 | Badge "Verificado"     | `verification_status='verified'`, `verified_at`/`verified_by` seteados. | super_admin | —                               |
| MPPS-03 | Doctor pending | `/admin/verifications` → "Verificar MPPS" (SACS) | Resultado async        | `credential_verifications` fila con resultado (por cédula, no MPPS).    | super_admin | cert TLS SACS vencido → manejar |

### 21. Panel Admin (dashboard, doctors, stats, settings/tasa)

Páginas: `/admin`, `/admin/doctors`, `/admin/patients`, `/admin/roles`,
`/admin/settings`, `/admin/finanzas`. BFF/backend: `/api/admin/dashboard`,
`/api/admin/doctors*`, `/api/admin/patients`, `/api/admin/settings*`,
`/api/admin/role-capabilities`, `/api/admin/doctors/export`. Tablas: `profiles`,
`subscriptions`, `app_settings` (key/value, ej tasa), `role_capabilities`.

| Caso   | Precondición | Pasos front                                        | Esperado UI                                           | Verificación BD                                                                                   | RBAC                           | Edge       |
| ------ | ------------ | -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ | ---------- |
| ADM-01 | super_admin  | `/admin` dashboard                                 | KPIs (médicos, citas 30d, pacientes, subs por vencer) | Counts coinciden con BD (sin PII de pacientes). Redis cache 300.                                  | super_admin (RolesGuard clase) | doctor→403 |
| ADM-02 | super_admin  | `/admin/doctors` con filtros activity/subscription | Lista filtrada                                        | filtro inválido → 400.                                                                            | super_admin                    | —          |
| ADM-03 | super_admin  | Editar suscripción de un doctor                    | Toast OK                                              | `subscriptions` actualizada (Zod) + cache invalidada.                                             | super_admin                    | —          |
| ADM-04 | super_admin  | `/admin/settings` → set tasa USD→Bs (manual)       | Toast "Tasa actualizada"                              | `app_settings` key tasa actualizada; Redis invalidado; `/api/settings/usdt-rate` público refleja. | super_admin (POST en finances) | doctor→403 |
| ADM-05 | super_admin  | `/admin/patients` stats                            | Solo counts globales                                  | Sin PII de pacientes en la respuesta.                                                             | super_admin; NUNCA PII         | —          |
| ADM-06 | super_admin  | `/admin/roles` → toggle capability                 | Switch persiste, aplica sin re-login                  | `role_capabilities` upsert ON CONFLICT; Redis `capabilities:{role}` invalidado.                   | super_admin                    | —          |
| ADM-07 | super_admin  | `/admin/doctors/export` (CSV)                      | Descarga CSV                                          | `text/csv` attachment; estado Activo/Frío/Inactivo según `last_sign_in_at`.                       | super_admin                    | —          |

### 22. Portal del paciente (rol patient)

Páginas: `/patient/dashboard`, `/patient/appointments`, `/patient/packages`,
`/patient/prescriptions`, `/patient/messages`, `/patient/profile`. BFF/backend:
`/api/patient/*`. Scope SIEMPRE por `auth_user_id = user.sub`.

| Caso  | Precondición      | Pasos front                        | Esperado UI                 | Verificación BD                                                 | RBAC               | Edge                     |
| ----- | ----------------- | ---------------------------------- | --------------------------- | --------------------------------------------------------------- | ------------------ | ------------------------ |
| PP-01 | Paciente logueado | `/patient/dashboard`               | Próxima cita + paquetes     | Datos scopeados por `auth_user_id`; no ve los de otro paciente. | scope auth_user_id | sin citas → estado vacío |
| PP-02 | Paciente          | `/patient/prescriptions`           | Recetas descifradas propias | medication cifrado en BD; descifra solo al dueño.               | scope auth_user_id | —                        |
| PP-03 | Paciente B        | Forzar id de paciente A en request | 404/403                     | Sin fuga de A.                                                  | Anti-IDOR          | —                        |

### 23. IA — Transcripción / asistente (ai-transcription)

BFF: `/api/doctor/consultations/transcribe` (proxy delgado). Backend: `/api/ai/transcribe`.
Tabla `ai_request_log` (sin PHI). Gating FAIL-CLOSED de `ai_transcription`.

| Caso  | Precondición                          | Pasos front                            | Esperado UI                          | Verificación BD                                                       | RBAC / seguridad                             | Edge |
| ----- | ------------------------------------- | -------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------- | ---- |
| AI-01 | Doctor con feature `ai_transcription` | Grabar audio en consulta → Transcribir | Muestra transcript + sugerencias     | `ai_request_log` fila SIN PHI; respuesta `{transcript, suggestions}`. | gating por plan; GEMINI_API_KEY solo backend | —    |
| AI-02 | Doctor SIN la feature                 | Intentar transcribir                   | Candado / "No disponible en tu plan" | Gating FAIL-CLOSED (super_admin bypassa).                             | gating                                       | —    |

---

## D) Casos de regresión específicos (NO deben repetirse)

> Sección destacada. Correr ENTERA antes de cada release. Referencian bugs reales.

| Reg-id | Bug original                                                                                                                                                                                                                | Caso ligado | Verificación rápida                                                                                                                                              |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REG-01 | Crear cita rompía por SQL `ANY` vs `IN` en `hasOverlap` (syntax error) — ✅ corregido (commit `57ede68`)                                                                                                                    | AGENDA-01   | Crear cita real → 200 y fila en `appointments`. El repo usa `status IN (:activeStatuses)` (correcto). Crear 2 citas consecutivas para ejercitar el overlap.      |
| REG-02 | Descargar documento daba 401 — el **controller del backend** leía `@Query('session')` pero el front envía `?sessionToken=` → llegaba vacío. ✅ corregido (commit `5bc730c`): controller ahora usa `@Query('sessionToken')`. | DOC-04      | `GET /api/documents/[token]/download?sessionToken=...` → 200 `application/pdf`. Verificado en prod (1510 bytes).                                                 |
| REG-03 | Enlace compartido contenía `localhost` — el backend no tenía `APP_BASE_URL` en prod. ✅ corregido (commit `5bc730c`): `deploy.yml` setea `APP_BASE_URL=$FURL` en delta-backend.                                             | DOC-02      | URL devuelta por `/share` empieza con `https://delta-frontend-...run.app/documents/`. Fallback en código sigue siendo `http://localhost:3000` si faltara el env. |
| REG-04 | Onboarding se repetía en cada login                                                                                                                                                                                         | AUTH-03/04  | `profiles.onboarding_completed=true` tras completar; 2º login NO muestra onboarding.                                                                             |
| REG-05 | Booking mostraba planes inventados sin planes del doctor                                                                                                                                                                    | BOOK-01/02  | Doctor sin `pricing_plans` con `show_in_booking=true` → `plans=[]` y UI sin planes ficticios.                                                                    |

### Verificación BD sugerida para REG-01 (sin PII)

```sql
-- cita creada correctamente (no imprimir snapshots de paciente)
SELECT id, scheduled_at, status, duration_minutes, created_at
  FROM appointments
 WHERE doctor_id = :doctorId
 ORDER BY created_at DESC LIMIT 3;
-- huérfanos: que no queden consultas sin cita ni citas sin doctor
SELECT count(*) FROM consultations c
  LEFT JOIN appointments a ON a.id = c.appointment_id
 WHERE c.appointment_id IS NOT NULL AND a.id IS NULL;
```

### Verificación BD sugerida para REG-05

```sql
SELECT count(*) AS planes_booking
  FROM pricing_plans
 WHERE doctor_id = :doctorId AND show_in_booking = true AND is_active = true;
-- si 0 → la respuesta de /booking/:doctorId/plans DEBE ser []
```

---

## E) Checklist de cierre por release

- [ ] `pnpm nx build backend` y `pnpm nx build frontend` verdes.
- [ ] `pnpm nx lint backend` y `lint frontend` verdes (0 errores; recordar `no-floating-promises`, `no-explicit-any`).
- [ ] `pnpm nx test backend` con EXIT 0 (suite ~2000+ tests).
- [ ] Boot del dist: `node dist/apps/backend/main.js` arranca sin throw.
- [ ] Migraciones aplicadas en prod (`SELECT name FROM "SequelizeMeta" ORDER BY name DESC LIMIT 5;`) — última = la del release.
- [ ] curl real de endpoints clave (vía BFF en prod o dist local): `/api/health` ok; crear cita; compartir+descargar documento.
- [ ] RBAC: doctor→403 en endpoints admin; doctor B no ve datos de doctor A (anti-IDOR) en al menos 3 módulos.
- [ ] PII: listas enmascaradas; `/reveal` escribió en `access_audit_log`; ningún log con PII en claro.
- [ ] Env de prod presentes: `APP_BASE_URL`/`FRONTEND_URL` (REG-03), `GEMINI_API_KEY` (Secret Manager), `AUTH_RESOLVE_SECRET`, `DB_PASSWORD`.
- [ ] Sección D (regresión) corrida ENTERA y PASA.
- [ ] QA visual del usuario cubrió cada módulo (marcar PASA/FALLA por módulo).
- [ ] Toda corrida de QA usó los **2 agentes en paralelo** (front + verificador BD/logs) retroalimentándose.
- [ ] Sentry sin nuevos errores tras el deploy (back + front).

---

> Mantener este guion vivo: cuando aparezca un bug de prod, agregar una fila a la
> **Sección D** y un caso al módulo correspondiente para que el qa-agent lo cubra siempre.
