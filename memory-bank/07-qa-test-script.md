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
- La **sección D-2026-07** (al final, tras el Checklist E) cubre la funcionalidad y los
  fixes de las sesiones **2026-07-07 a 2026-07-10** (gating por plan, ficha de paciente,
  módulo Consultas inline, Seguimiento/`shared_files`, compartir, horario multi-bloque,
  imágenes/PDF, Nueva consulta, bloques de nombre fijo + Paraclínico, email de confirmación),
  que las secciones C/D-regresión previas no cubrían. Las secciones **D-2026-07-11** (recorrido de
  doctor real, 22 observaciones) y **D-2026-07-12** (récipe 2 hojas, booking, finanzas, Sentry) siguen
  al final con el mismo método E2E.

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

Páginas: `/doctor/consultations`, `/doctor/consultations/[id]`,
`/doctor/settings/consultation-blocks`. (cita-360 eliminado 2026-06-23: la edición vive en `/doctor/consultations/[id]`.) BFF: `/api/doctor/consultations`,
`/api/consultations/[id]`, `/api/doctor/consultation-blocks`. Tablas: `consultations`
(consultation_code DLT-YYYYMM-XXXX, diagnosis/treatment/notes CIFRADOS, payment_status,
amount, blocks_snapshot JSONB), `doctor_consultation_blocks`, `consultation_block_catalog`,
`specialty_default_blocks`.

| Caso    | Precondición                      | Pasos front                                                             | Esperado UI                                          | Verificación BD                                                                                                                                                                                                         | RBAC / seguridad               | Edge / errores                |
| ------- | --------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------- |
| CONS-01 | Cita completada                   | `/doctor/consultations/[id]` → llenar diagnóstico/tratamiento → Guardar | Toast "Consulta guardada"                            | `SELECT consultation_code, length(diagnosis) AS dl, payment_status FROM consultations WHERE doctor_id=:d ORDER BY created_at DESC LIMIT 1` → `consultation_code` ~`DLT-YYYYMM-XXXX` único; `dl>60` (cifrado); UNA fila. | doctorId=user.sub              | code colisión → retry interno |
| CONS-02 | Consulta existe                   | Abrir detalle                                                           | Campos clínicos DESCIFRADOS visibles al dueño        | `consultations.diagnosis` sigue cifrado en BD (no plaintext).                                                                                                                                                           | ownership; descifra solo dueño | —                             |
| CONS-03 | Consulta con bloques dinámicos    | Editar bloques del consultorio → Guardar                                | Bloques persisten al recargar                        | `blocks_snapshot` (jsonb) refleja los bloques; NO debe contener PHI estructurada fuera de los campos cifrados (revisar).                                                                                                | ownership                      | —                             |
| CONS-04 | Consulta `payment_status=pending` | Aprobar pago                                                            | Badge "Pagado"                                       | `consultations.payment_status='approved'`. Re-aprobar → PaymentAlreadyApprovedError.                                                                                                                                    | ownership                      | doble aprobación → 409/422    |
| CONS-05 | Doctor                            | Configurar bloques de consulta (`consultation-blocks`)                  | Toast "Bloque guardado" (toast, NO alert)            | `doctor_consultation_blocks` fila por bloque; orden persistido.                                                                                                                                                         | doctorId=user.sub              | —                             |
| CONS-06 | Doctor B                          | GET consulta de doctor A                                                | 404                                                  | Sin fuga.                                                                                                                                                                                                               | Anti-IDOR                      | —                             |
| CONS-07 | Billing                           | `/api/consultations/with-patient`                                       | Lista con nombre/teléfono del paciente (uso billing) | ⚠️ expone PII al doctor DUEÑO; verificar doble scope owner. `?limit` máx 200.                                                                                                                                           | Anti-IDOR doble scope          | limit>200 → recortado         |

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

| Caso    | Precondición                                     | Pasos front                               | Esperado UI                                     | Verificación BD                                                                                                                            | RBAC / seguridad                  | Edge                         |
| ------- | ------------------------------------------------ | ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------- |
| BOOK-01 | Doctor activo CON planes show_in_booking         | Abrir `/book/[doctorId]`                  | Lista de planes reales del doctor               | `GET /api/booking/:doctorId/plans` = filas `pricing_plans` con `show_in_booking=true`. **REGRESIÓN**: NUNCA mostrar planes inventados.     | público                           | —                            |
| BOOK-02 | Doctor SIN planes en booking                     | Abrir `/book/[doctorId]`                  | Estado vacío / sin planes (NO planes ficticios) | `plans` = `[]`. La UI no debe fabricar planes.                                                                                             | público                           | —                            |
| BOOK-03 | Doctor activo con horario                        | Elegir fecha → ver slots                  | Slots disponibles del día                       | `slots` derivados de offices ACTIVOS + horario + bloqueos + horizonte. Ocupados marcados `available:false`.                                | público                           | día sin atención → sin slots |
| BOOK-04 | Slot libre                                       | Completar datos + reservar                | Confirmación "Cita reservada"                   | `appointments` nueva fila (status scheduled); `patients` find-or-create (PII cifrada); `payments` fila pending; respuesta SIN `patientId`. | público; no fuga PII en respuesta | datos inválidos → 400        |
| BOOK-05 | Paciente con paquete (por email)                 | Reservar usando saldo de paquete          | "Sesión consumida"                              | `patient_packages.used_sessions` +1 (optimistic lock, sin doble consumo); `appointments.package_id` seteado.                               | público                           | sin saldo → error            |
| BOOK-06 | doctorId inexistente/inactivo                    | Abrir `/book/[malId]`                     | 404 (anti-enumeración)                          | No revela existencia.                                                                                                                      | anti-enumeración                  | —                            |
| BOOK-07 | Slot recién tomado                               | Dos reservas simultáneas mismo slot       | La 2ª falla "Horario ocupado"                   | Solo 1 cita; índice/transacción atómica evita doble booking.                                                                               | —                                 | —                            |
| BOOK-08 | Doctor en **Delta Free** (sin feature `booking`) | Abrir `/book/[doctorId]`                  | "Reservas no disponibles" (no formulario)       | `GET /api/booking/:id/info` → `bookingEnabled=false` (plan efectivo Free). Settings del doctor oculta tab "Link público"/QR.               | público; gating por plan          | —                            |
| BOOK-09 | Doctor Free                                      | POST `/api/booking` directo (saltando UI) | 403 "Reservas no disponibles"                   | `CreateBookingUseCase` lanza `BookingNotEnabledError` (403). NO crea cita. Defensa en profundidad.                                         | gating server-side                | Base/Plus → permite          |

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

| Caso   | Precondición                          | Pasos front                                                 | Esperado UI                                                                                                             | Verificación BD                                                                                                     | RBAC                     | Edge       |
| ------ | ------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------- |
| SUB-01 | Doctor con plan                       | `/doctor/subscription`                                      | Banner según `bannerLevel` (suspended/critical≤3d/warning≤7d/none)                                                      | `subscriptions.status`/`current_period_end` consistentes con el banner.                                             | ownership                | —          |
| SUB-02 | Doctor                                | `/doctor/upgrade` muestra planes públicos                   | Planes/precios activos, sin flags internos                                                                              | `/api/plans?role=doctor` = `plan_configs` activos + `plan_prices` activos. NO expone flags internos.                | público                  | —          |
| SUB-03 | super_admin                           | `/admin/plans` → toggle `is_active` de un plan              | Switch persiste                                                                                                         | `plan_configs.is_active` cambió; `/api/plans` público refleja.                                                      | super_admin (RolesGuard) | doctor→403 |
| SUB-04 | super_admin                           | `/admin/plan-features` → toggle feature (ej `ai_assistant`) | Switch persiste                                                                                                         | `plan_features` upsert (plan,feature_key,enabled); Redis `features:{plan}` invalidado.                              | super_admin              | —          |
| SUB-05 | super_admin                           | `/admin/plans/:planKey/prices` → set precios por período    | Toast OK                                                                                                                | `plan_prices` filas monthly/quarterly/semiannual/annual (transaccional).                                            | super_admin              | —          |
| SUB-06 | Doctor plan Plus → expira             | Login tras expirar                                          | Acceso degradado a Free, datos intactos                                                                                 | `/api/doctor/features` v2: downgrade perezoso; Free permanente no pierde datos.                                     | —                        | —          |
| SUB-07 | Doctor en **Delta Free** (permanente) | `/doctor/subscription`                                      | Panel muestra "Plan permanente / ∞ sin vencimiento" (NO "termina el null"); botón "Mejorar mi plan" → `/doctor/upgrade` | `GET /api/doctor/subscription` envuelto en `{success,data}`; `state.is_permanent=true`. No queda cargando infinito. | ownership                | —          |
| SUB-08 | Doctor en `/doctor/upgrade`           | Abrir la página de upgrade                                  | El **plan actual** aparece con badge "Plan actual"                                                                      | Lee `effective_plan_key` de `/api/doctor/features`; resalta esa tarjeta.                                            | ownership                | —          |

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

### 23. IA — Transcripción / asistente / texto (ai-transcription + ai/text)

BFF transcripción: `/api/doctor/consultations/transcribe` → `/api/ai/transcribe`.
BFF texto: `/api/doctor/ai` → `/api/ai/text` (reactivado 2026-06-18 — **verificar que el endpoint
backend `/api/ai/text` exista**; si aún es stub/404, marcar AI-03/04/05 como BLOQUEADO).
Tabla `ai_request_log` (sin PHI). Gating FAIL-CLOSED; gating de texto se aplica EN EL BACKEND (plan efectivo).

| Caso  | Precondición                          | Pasos front                                                     | Esperado UI                              | Verificación BD                                                                         | RBAC / seguridad                                        | Edge                             |
| ----- | ------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------- |
| AI-01 | Doctor con feature `ai_transcription` | Grabar audio en consulta → Transcribir                          | Muestra transcript + sugerencias         | `ai_request_log` fila SIN PHI; respuesta `{transcript, suggestions}`.                   | gating por plan; GEMINI_API_KEY solo backend            | —                                |
| AI-02 | Doctor SIN la feature                 | Intentar transcribir                                            | Candado / "No disponible en tu plan"     | Gating FAIL-CLOSED (super_admin bypassa).                                               | gating                                                  | —                                |
| AI-03 | Doctor Plus (`ai_assistant`)          | En consulta, "Mejorar redacción" de un bloque (`improve_block`) | Devuelve texto mejorado en `data.result` | `ai_request_log` fila SIN PHI (acción improve_block).                                   | gating `ai_assistant` en backend; Free/Base→403/candado | bloque vacío → manejar           |
| AI-04 | Doctor Plus (`ai_reports`)            | "Resumir informe" (`summarize_report`)                          | Resumen del informe en `data.result`     | `ai_request_log` fila SIN PHI (acción summarize_report).                                | gating `ai_reports`; sin la feature→403                 | informe vacío → manejar          |
| AI-05 | Doctor Plus (`ai_assistant`)          | "Resumen del historial" del paciente (`patient_history`)        | Resumen ejecutivo en `data.result`       | `ai_request_log` fila SIN PHI. Paciente inexistente → 404 (`patient-not-found-for-ai`). | gating `ai_assistant`; anti-IDOR del paciente           | paciente sin historial → manejar |

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
| REG-06 | Descarga de documento no exigía cédula (solo código) — riesgo de acceso si se filtra el código. ✅ ahora exige **cédula + código** (commit `33958ea`/`4f1a081`, match tolerante a V/E/P).                                   | DOC-03/03b  | `verify-code` con código correcto + cédula incorrecta → 422 genérico. Cédula `12345678` ≡ `V-12345678` (normalización).                                          |
| REG-07 | Panel de suscripción de plan Free permanente cargaba infinito / mostraba "termina el null". ✅ corregido (commits `713de54`/`4032c73`): handler `{success,data}` + `is_permanent` → "∞ sin vencimiento".                    | SUB-07      | `/doctor/subscription` de un doctor Free carga y muestra "Plan permanente".                                                                                      |
| REG-08 | Booking online quedaba disponible en planes que no lo incluyen. ✅ feature `booking` gateada por plan (commit `96f3d89`): `bookingEnabled` en `/info` + `BookingNotEnabledError` 403 en el POST.                            | BOOK-08/09  | Doctor Free → `/book` "Reservas no disponibles" y POST `/api/booking` → 403.                                                                                     |

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

## D-2026-07) Cobertura sesiones 2026-07-07..10 (funcionalidad + fixes recientes)

> Casos NUEVOS de las sesiones **2026-07-07 → 2026-07-10** (commits `77786bb`, `ccb8a02`,
> `ce8a5d8`, `f1ca146`, `238402d`/`406f6d4`, `664c135`, `7b35719`, `cf2df80`, `74e8c91`,
> `70444b6`, `c87c98e`, `6ed43f4`). Reusan el entorno prod y el harness de BD de las
> secciones **Entorno** y **B**; las tablas reales están en B ("Tablas reales"). No repetir
> aquí el setup del proxy ni el password. Convención: `doctorId` de `user.sub`; PII de
> paciente NUNCA en claro en logs (regla de B).

### D1. Gating de plan por página (interstitial) — guard en `doctor/layout.tsx`

> El sidebar ya pone candado visual, pero el guard de ACCESO (`PLAN_GATED_ROUTES` +
> `PlanLockedNotice`) impide cargar el contenido cuando se entra por URL directa o por un
> enlace cross-módulo. Módulos gateados: `agenda, finances, cobros, billing, services,
reminders, crm, ehr, messages, reports, patients, consultations`. Free (`delta_free`)
> habilita `dashboard, patients, consultations, settings` (según `plan_features`).

| Caso    | Precondición             | Pasos front                                                                                                                           | Esperado UI                                                                                                          | Verificación BD                                                                                                                             | RBAC / seguridad                                       | Edge / errores                                                      |
| ------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| GATE-01 | Doctor en **Delta Free** | Navegar por URL directa a `/doctor/agenda`                                                                                            | Interstitial "**Sección no disponible en tu plan**" (card con candado + botón "Mejorar mi plan"); NO carga la agenda | `SELECT plan, subscription_status FROM profiles WHERE id=:d` → `plan` NULL/`delta_free` (downgrade perezoso). `plan_features` sin `agenda`. | Gating client-side; el BFF además gatea server-side    | `/doctor/upgrade` (botón) → carga la página de planes               |
| GATE-02 | Doctor Free              | URL directa a cada uno: `/doctor/finances`, `/cobros`, `/billing`, `/services`, `/reminders`, `/crm`, `/ehr`, `/messages`, `/reports` | Interstitial en TODOS; contenido del módulo NO se renderiza                                                          | `plan_features` del plan efectivo no incluye el `moduleKey` de la ruta.                                                                     | idem                                                   | ruta sin entrada en `PLAN_GATED_ROUTES` (offices/templates) → libre |
| GATE-03 | Doctor Free              | Desde el **dashboard**, clickear un enlace cross-módulo (widget → agenda/cobros)                                                      | Igual bloqueado: interstitial, no salta el candado                                                                   | —                                                                                                                                           | el guard corre por `pathname`, no por origen del click | —                                                                   |
| GATE-04 | Doctor Free              | Abrir `/doctor` (dashboard), `/doctor/patients`, `/doctor/consultations`, `/doctor/settings`                                          | Cargan normal (permitidos en Free)                                                                                   | `plan_features` incluye `dashboard/patients/consultations`; settings sin gate.                                                              | —                                                      | —                                                                   |
| GATE-05 | Doctor **Base/Plus**     | URL directa a `/doctor/agenda`, `/finances`, etc.                                                                                     | Cargan (plan superior habilita los módulos)                                                                          | `plan='delta_base'/'delta_plus'`, `subscription_status='active'`; `plan_features` incluye los módulos.                                      | super_admin bypassa gating                             | —                                                                   |

### D2. Ficha de paciente (`/doctor/patients` + deep-links)

| Caso     | Precondición                                 | Pasos front                                               | Esperado UI                                                                                         | Verificación BD                                                                                                       | RBAC / seguridad                       | Edge / errores                             |
| -------- | -------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------ |
| FICHA-01 | Paciente con `birth_date`                    | Abrir ficha → tab datos                                   | Campo **Edad** es **read-only**, calculado de la fecha de nacimiento (no editable)                  | La edad NO se persiste; deriva de `patients.birth_date` (cifrada/decrypt al dueño). No se escribe columna `age`.      | ownership; PII decrypt solo dueño      | sin fecha de nacimiento → edad vacía/—     |
| FICHA-02 | Paciente con adjuntos que subió (shared/req) | Header ficha → botón "**Documentos (N)**"                 | Abre modal con adjuntos del paciente; cada uno con **Ver/Descargar** (signed URLs GCS)              | `patientRequests.length` = N (fuente combinada patient-requests / shared-files); URLs firmadas 1h.                    | ownership; sin firma → 403             | N=0 → botón "Documentos (0)" / modal vacío |
| FICHA-03 | Paciente del doctor                          | Tab **Seguimiento** → sección "Solicitudes de documentos" | Lista las solicitudes de documentos del paciente                                                    | filas de patient-requests del paciente; scope `doctor_id=:d`.                                                         | ownership                              | sin solicitudes → estado vacío             |
| FICHA-04 | Consulta del paciente con pago pendiente     | Tab Historial → fila de consulta                          | El **selector Aprobado/Pendiente fue quitado**; queda solo un **badge read-only** de estado de pago | Aprobar NO ocurre acá; el estado se cambia en Cobros/detalle (`consultations.payment_status` no muta desde la ficha). | aprobación centralizada (anti-doble)   | —                                          |
| FICHA-05 | Doctor con pacientes                         | Abrir `/doctor/patients?open=<patientId>`                 | Abre la ficha de ESE paciente directo (deep-link)                                                   | `searchParams.get('open')` resuelve al paciente si existe y es del doctor.                                            | anti-IDOR: solo abre si `doctor_id=:d` | `?open=<idAjeno>` → no abre / 404          |
| FICHA-06 | Paciente con nombre largo                    | Abrir ficha                                               | Header en **2 filas**; el nombre largo NO se parte a media palabra                                  | — (solo layout)                                                                                                       | —                                      | nombre muy corto → sigue OK                |
| FICHA-07 | Paciente con consultas                       | Tab **Historial Médico** → botón "**Abrir consulta**"     | Navega a `/doctor/consultations?open=<consultId>` (abre el editor inline de esa consulta)           | `consultId` corresponde a una consulta del doctor.                                                                    | anti-IDOR                              | consulta ajena → 404 al abrir              |

### D3. Módulo Consultas (editor inline con `?open=`; página `[id]` eliminada)

> La edición de consulta vive en `/doctor/consultations` con `?open=<consultId>` (deep-link).
> `blocks_snapshot` (JSONB) es la columna real que guarda los bloques (el payload/IA lo llama
> `blocks_data`). Campos clínicos cifrados: `chief_complaint, diagnosis, treatment, notes`.

| Caso     | Precondición                    | Pasos front                                                                      | Esperado UI                                                                                                                                | Verificación BD                                                                                                                                                            | RBAC / seguridad              | Edge / errores                                                        |
| -------- | ------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| CONS-D01 | —                               | Navegar a `/doctor/consultations/<uuid>` (ruta legacy)                           | **404** (la página `[id]` fue eliminada; el editor es inline)                                                                              | —                                                                                                                                                                          | —                             | —                                                                     |
| CONS-D02 | Consulta abierta (`?open=`)     | Observar al abrir la consulta                                                    | Botón "**Generar Documento**" (antes "Generar informe"); **NO** se auto-genera nada al abrir (sin "loading fantasma")                      | Ninguna escritura al abrir; `blocks_snapshot` sin cambios por el mero open.                                                                                                | ownership                     | —                                                                     |
| CONS-D03 | Consulta con bloques cargados   | Click "Generar Documento" → tildar secciones → Generar                           | Modal de secciones; genera **UN** PDF branded (logo/firma/matrícula + **cédula del paciente**), on-demand, solo con las secciones tildadas | El PDF se arma en cliente (react-pdf) con datos de la consulta; incluye `Cédula: <nro>`. Sin secciones tildadas → deshabilitado.                                           | ownership; PII solo del dueño | 0 secciones → no genera                                               |
| CONS-D04 | Consulta abierta                | Click "Ver ficha del paciente"                                                   | Navega a `/doctor/patients?open=<patientId>`                                                                                               | resuelve el paciente de la consulta.                                                                                                                                       | anti-IDOR                     | —                                                                     |
| CONS-D05 | Consulta pendiente              | Marcar **atendida** / **pagada**                                                 | El listado de consultas refleja el nuevo estado                                                                                            | `consultations.status`/`payment_status` actualizados; se ven en el GET de lista.                                                                                           | ownership                     | transición inválida → error de dominio                                |
| CONS-D06 | Consulta con ≥2 bloques (A y B) | Escribir en bloque A → cambiar a bloque B → volver a A → cambiar de tab / cerrar | **Autoguardado / sin pérdida**: A conserva su texto al volver; al cambiar de tab o cerrar se guarda TODO                                   | `SELECT blocks_snapshot FROM consultations WHERE id=:c` → el JSONB contiene **TODOS** los bloques con contenido (no solo el último editado). Campos cifrados con len alta. | ownership                     | **REGRESIÓN** (commit `6ed43f4`): antes se perdía el bloque no-activo |
| CONS-D07 | Doctor con catálogo de bloques  | Abrir modal "**Agregar bloque a esta consulta**"                                 | Muestra los **labels** de los bloques del catálogo (no filas vacías)                                                                       | labels leídos del catálogo en camelCase (fix `7b35719`); `consultation_block_catalog`.                                                                                     | ownership                     | catálogo vacío → sin opciones                                         |
| CONS-D08 | Doctor B                        | Abrir `?open=<consultId de A>`                                                   | 404 / sin datos                                                                                                                            | Sin fuga de PHI de A.                                                                                                                                                      | Anti-IDOR                     | —                                                                     |

### D4. Seguimiento del paciente — módulo `shared_files`

> Backend DDD `shared-files` (migración `20260708000001`). Doctor: `@Controller('doctor/shared-files')`
> (`GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /mark-read`, `GET /unread-counts`), scope
> `doctor_id = user.sub`. Paciente: `@Controller('patient/shared-files')` (`GET /`, `POST /`,
> `POST /mark-read`), scope por `patients.auth_user_id = user.sub`. Tabla `shared_files`
> (`doctor_id, patient_id, category, status, created_by, file_url`=PATH GCS, `read_by_doctor`,
> `read_by_patient`, `title`, `description`). CHECKs: `category IN (instruction,file,recipe,lab_result,image,other,comment)`,
> `status IN (pending,completed,reviewed)`, `created_by IN (doctor,patient)`.

| Caso   | Precondición                   | Pasos front                                                                        | Esperado UI                                                | Verificación BD                                                                                                                                                      | RBAC / seguridad                                             | Edge / errores                            |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------- | ------------------------------ |
| SHF-01 | Doctor con paciente            | Ficha → tab Seguimiento → enviar **tarea/instrucción**                             | Aparece en el feed con badge **TÚ** + estado; toast        | `SELECT category,status,created_by FROM shared_files WHERE doctor_id=:d AND patient_id=:p ORDER BY created_at DESC LIMIT 1` → `created_by='doctor'`, status pending. | `doctor_id=user.sub`                                         | título vacío → validación                 |
| SHF-02 | Doctor                         | Enviar **comentario** y **subir archivo** en Seguimiento                           | Comentario y archivo en el feed (Ver/Descargar signed URL) | filas `category='comment'` / `category='file'                                                                                                                        | 'image'`; `file_url` = PATH GCS (no URL firmada persistida). | ownership; storage privado (signed URL)   | tipo/tamaño inválido → rechazo |
| SHF-03 | Ítem de seguimiento del doctor | Editar y luego eliminar                                                            | Cambios visibles; el ítem desaparece al eliminar           | `PATCH /:id` actualiza misma fila; `DELETE /:id` la borra; no duplica ni deja huérfano.                                                                              | ownership (`doctor_id=:d`)                                   | id ajeno → 404 (`SharedFileAccessDenied`) |
| SHF-04 | Paciente con ítems del doctor  | Portal `/patient/seguimiento`                                                      | Ve tareas/archivos del doctor; badges de no-leído          | `GET /api/patient/shared-files` scope `auth_user_id=user.sub`.                                                                                                       | scope paciente                                               | sin ítems → estado vacío                  |
| SHF-05 | Paciente                       | Responder con **comentario** + **archivo**; marcar leído                           | Respuesta en el feed; el no-leído se limpia                | filas `created_by='patient'`; `POST /mark-read` setea `read_by_patient=true`; en doctor `read_by_doctor` refleja lo suyo.                                            | scope `auth_user_id`                                         | —                                         |
| SHF-06 | Doctor con varios pacientes    | Ficha/lista → observar badges de no-leído por paciente                             | Badge de no-leídos por paciente                            | `GET /doctor/shared-files/unread-counts` agrupa por `patient_id` los `read_by_doctor=false` creados por el paciente.                                                 | ownership                                                    | 0 no-leídos → sin badge                   |
| SHF-07 | Doctor B / Paciente B          | Doctor B lista shared-files de paciente de A; Paciente B fuerza `patient_id` ajeno | 403/404; sin datos                                         | Sin fuga. Doctor por `doctor_id=user.sub`; paciente por `auth_user_id` (nunca del body).                                                                             | **Anti-IDOR** (doble: doctor y paciente)                     | —                                         |

### D5. Compartir documentos (enlace + código + WhatsApp)

> `ShareDocumentsModal`: genera enlace + código de 6 dígitos y ofrece "**Enviar por WhatsApp**"
> cuyo mensaje incluye **enlace y código**. El PDF consolidado que descarga el paciente lleva
> **"Cédula: <nro>"** en el encabezado. (Complementa el módulo 15 / DOC-\* de la sección C.)

| Caso     | Precondición            | Pasos front                                                          | Esperado UI                                                                                | Verificación BD                                                                                           | RBAC / seguridad                     | Edge / errores                       |
| -------- | ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------ |
| SHARE-01 | Consulta del doctor     | Compartir → elegir secciones → Generar → click "Enviar por WhatsApp" | Abre WhatsApp (`wa.me`) con un mensaje que contiene **el enlace y el código de 6 dígitos** | `shared_document_links` + `document_access_codes` (1 código); el mensaje wa.me arma link+code en cliente. | doctor; ≥1 sección                   | paciente sin teléfono → botón oculto |
| SHARE-02 | Enlace + código válidos | Paciente descarga el PDF consolidado                                 | El PDF incluye "**Cédula: <nro>**" en el encabezado                                        | cédula del paciente descifrada solo al armar el PDF; no se loguea en claro.                               | pública tras verificar cédula+código | —                                    |

### D6. Horario multi-bloque por consultorio (`/doctor/offices`)

> Cada día admite **N bloques** ("+ Agregar bloque"). `doctor_offices.schedule` (JSONB) puede
> tener **varias entradas por `day`** (day 0=Lunes). Errores de dominio:
> `OFFICE_INVALID_SCHEDULE` (422, solape dentro del mismo consultorio o start>=end) y
> `OFFICE_SCHEDULE_CONFLICT` (409, solape contra otro consultorio ACTIVO del mismo doctor).

| Caso     | Precondición                                              | Pasos front                                                              | Esperado UI                                                                   | Verificación BD                                                                                          | RBAC / seguridad | Edge / errores                              |
| -------- | --------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------- |
| SCHED-01 | Consultorio en edición                                    | En un día, "+ Agregar bloque" → definir 2 franjas NO solapadas → Guardar | Guarda OK; toast                                                              | `SELECT schedule FROM doctor_offices WHERE id=:o` → JSONB con **2 entradas** para ese `day` (start/end). | ownership        | —                                           |
| SCHED-02 | Mismo día con 2 bloques que **se solapan**                | Definir 08-11 y 10-12 el mismo día                                       | **Validación en vivo**: alerta de solape + botón **Guardar deshabilitado**    | POST/PUT igual rechazado en backend → `OfficeInvalidScheduleError` (422). No persiste.                   | ownership        | start>=end → mismo 422                      |
| SCHED-03 | Consultorio A ocupa lun 08-11; crear/editar Consultorio B | En B, poner lun 08-11 → Guardar                                          | **409** `OFFICE_SCHEDULE_CONFLICT` (toast "se solapa con otro consultorio")   | ninguna fila de B con ese solape; A intacto. Verifica contra offices `is_active=true` del doctor.        | ownership        | B en día distinto o A inactivo → sí permite |
| SCHED-04 | Consultorio con varios bloques por día                    | Ver slots del booking de ese día                                         | Los slots del booking **unen todos los bloques** del día (no solo el primero) | `get-available-slots` deriva de todas las entradas del `day` en `schedule`.                              | público          | día sin entradas → sin slots                |

### D7. Imágenes / PDF (preview, avatar, logos/firma en PDF, toasts)

> Fix raíz: el `?t=` cache-buster sobre la **signed URL de GCS** rompía la firma → preview roto.
> CORS del bucket GCS ya configurado (ADR-016) → react-pdf baja logos/firmas **directo de GCS**.

| Caso   | Precondición                   | Pasos front                                         | Esperado UI                                                                     | Verificación BD                                                        | RBAC / seguridad                | Edge / errores                           |
| ------ | ------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------- | ---------------------------------------- |
| IMG-01 | Doctor                         | Subir foto en consultorio / avatar / logo / firma   | El **preview se ve a la primera** (NO roto). Sin `?t=` roto sobre la signed URL | la URL guardada es el PATH; el front pide signed URL sin mutarla.      | storage privado/público firmado | tipo/tamaño inválido → rechazo           |
| IMG-02 | Doctor sube avatar             | Ver el avatar cargado                               | Se ve **completo** (zoom "contain") y se puede **alejar**                       | —                                                                      | —                               | —                                        |
| IMG-03 | Doctor con logo/firma cargados | Generar/ver un PDF (visor) y descargarlo            | Logo y firma **aparecen** en el PDF, tanto en el visor como en la descarga      | react-pdf baja los assets directo de GCS (CORS OK); no rompe por CORS. | —                               | asset faltante → PDF sin logo (no crash) |
| IMG-04 | Doctor en Configuración        | Guardar config; aplicar plantilla a todos + guardar | Aparece **toast** al Guardar y al aplicar/guardar plantillas                    | `app_settings`/`doctor_templates` persistidos.                         | ownership                       | —                                        |
| IMG-05 | Doctor en Configuración        | Recorrer las secciones                              | **Notificaciones** y **WhatsApp Business API** están **ocultas**                | — (solo UI)                                                            | —                               | —                                        |

### D8. Nueva consulta (`NewAppointmentFlow` / `useAppointmentFlow`)

| Caso   | Precondición                        | Pasos front                                  | Esperado UI                                                                      | Verificación BD                                                                                      | RBAC / seguridad | Edge / errores                           |
| ------ | ----------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------- |
| NAF-01 | Doctor                              | Abrir "Nueva consulta"                       | Header con el **logo nuevo (DeltaMark)**                                         | — (UI)                                                                                               | —                | —                                        |
| NAF-02 | Doctor con varios pacientes         | En el filtro de paciente, escribir un nombre | Filtra de verdad (llama `/api/patients/search?q=`; antes `?search=` traía todos) | request a `/api/patients/search?q=<txt>&limit=8`; devuelve solo matches (por hash/substring in-app). | ownership        | sin match → lista vacía                  |
| NAF-03 | Doctor **con consultorios** creados | Avanzar al paso de consultorio               | NO aparece "Sin consultorio específico"; se **auto-selecciona el primero**       | la cita queda con `office_id` del consultorio (no NULL).                                             | ownership        | doctor sin consultorios → alerta "crear" |

### D9. Bloques de consulta — 6 de nombre fijo + Paraclínico

> Catálogo (`consultation_block_catalog`, seed + migración `20260710000000-paraclinico-block`).
> 6 bloques de **nombre fijo (no renombrables)**: **Motivo de consulta** (`chief_complaint`),
> **Antecedentes** (`history`), **Diagnóstico** (`diagnosis`), **Prescripción** (`prescription`),
> **Indicaciones** (`indications`), **Paraclínico** (`paraclinical`, recién agregado).
> En `/doctor/settings/consultation-blocks` esos 6 muestran badge "**Nombre fijo**" sin input editable.

| Caso   | Precondición | Pasos front                                         | Esperado UI                                                                                           | Verificación BD                                                                                              | RBAC / seguridad | Edge / errores |
| ------ | ------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------- | -------------- |
| BLK-01 | Doctor       | `/doctor/settings/consultation-blocks`              | Los 6 bloques fijos muestran badge "**Nombre fijo**" y **no** tienen input de renombrado; el resto sí | catálogo incluye las 6 `block_key` (incl. `paraclinical`); esos 6 marcados como no-renombrables.             | ownership        | —              |
| BLK-02 | Doctor       | Verificar que **Paraclínico** existe en el catálogo | Aparece "Paraclínico" seleccionable en consultas                                                      | `SELECT block_key FROM consultation_block_catalog WHERE block_key='paraclinical'` → existe (post-migración). | —                | —              |

### D10. Email de confirmación de cita (timezone + branding)

> Fix en `appointment-notification.service.ts` (commit `70444b6`) + migración
> `20260710000001-email-branding-delta-salud`. Templates en `email_templates`
> (`appointment_confirmation_online` / `_inperson`).

| Caso    | Precondición                  | Pasos front                                         | Esperado UI                                                                                  | Verificación BD                                                                                                                | RBAC / seguridad           | Edge / errores                     |
| ------- | ----------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ---------------------------------- |
| MAIL-01 | Doctor con paciente con email | Agendar/confirmar una cita 09:20 → revisar el email | La **hora** sale en **America/Caracas**: la cita 09:20 dice **09:20** (NO 1:20 p.m. UTC)     | `email_send_log` con `sent` para `appointment_confirmation_*`; `appointment_time` formateado con `timeZone:'America/Caracas'`. | no PII de paciente en logs | modalidad online → usa `meet_link` |
| MAIL-02 | Igual que MAIL-01             | Ver header/branding del email                       | El header dice "**Delta Salud**" (no "Delta Medical CRM"); color de marca **#0891b2** (teal) | `email_templates` (post migración branding) con el nuevo header/color.                                                         | —                          | —                                  |

### Pendientes (verificar cuando se implementen)

> Casos NO probados aún (funcionalidad no confirmada / pendiente). NO marcar como PASA hasta implementar.

| Caso    | Qué verificar cuando se implemente                                                                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PEND-01 | **Bloqueo de disponibilidad debe ocultar slots**: crear un bloqueo (`doctor_availability_blocks`) → `booking/slots` NO ofrece esos horarios en el link público.                           |
| PEND-02 | **`booking_require_reason=off` debe quitar el motivo en el link público**: con el toggle apagado, el formulario público NO pide "motivo de consulta".                                     |
| PEND-03 | **El motivo del booking debe poblar el bloque Motivo en la consulta**: el `chief_complaint` de la reserva aparece precargado en el bloque "Motivo de consulta" al abrir la consulta.      |
| PEND-04 | **Compartir debe enviar el MISMO PDF branded que la descarga**: el PDF que recibe el paciente por compartir == el PDF consolidado branded (logo/firma/matrícula + cédula) de la descarga. |
| PEND-05 | **Pago de consulta con referencia + comprobante opcionales y cambiar método**: registrar pago permitiendo referencia/comprobante opcionales y cambiar el método de pago.                  |
| PEND-06 | **Link público con "pagar después" + datos de pago del doctor**: la reserva pública ofrece "pagar después" y muestra los datos de pago del doctor (métodos activos).                      |

---

## D-2026-07-11) Lote QA "doctor real" — 22 observaciones del usuario + método reforzado

> **Por qué existe esta sección (queja del usuario 2026-07-11):** el ciclo de QA anterior
> NO fue bueno — se probaron acciones **aisladas** ("crear paciente OK", "crear cita OK")
> en vez de **recorridos completos de un médico real**. Por eso se escaparon 22 bugs
> encadenados (crear paciente → agendar → ver en consultas → cobrar → generar documento →
> compartir). **Regla nueva y OBLIGATORIA:** el Agente A NO valida un caso como PASA hasta
> completar el **recorrido end-to-end** del que forma parte y comprobar el efecto en las
> pantallas _siguientes_ (no solo en la que ejecutó la acción). "La UI no dio error" NO es PASA.

### D-11.0 — Recorrido de doctor real (E2E obligatorio, ejecutar COMPLETO en cada release)

Ejecutar como un médico que estrena la cuenta, **sin saltarse pasos** y verificando cada
pantalla siguiente. Agente B verifica en BD en cada punto (sin PII).

1. **Inicio → "Crear paciente":** llenar el form. Teléfono: escribir **más de 10 dígitos** →
   debe mostrar "No debe exceder 10 dígitos" y **NO borrar** lo escrito (D-11.1). Guardar.
2. Al crear, aparece "¿Crear cita ahora?" → **"Crear cita ahora"** → el modal-pregunta debe
   **cerrarse** y abrir "Nueva consulta" con el paciente **preseleccionado** (D-11.3). NO dos modales.
3. Completar la cita (consultorio, tipo, fecha/hora) y crear → verificar que **redirige a
   Consultas** y que **la consulta recién creada APARECE en el listado** con badge
   **"Por confirmar"** (D-11.4/D-11.5). B: existe fila en `consultations` ligada al `appointment`.
4. **Inicio → Finanzas:** "Dinero por ingresar" debe reflejar el monto de esa consulta sin pago
   (≠ $0) (D-11.7). B: `SUM(COALESCE(c.amount,a.plan_price))` de pending > 0.
5. **Menú izq. → Consultas** (estando en el editor de una consulta): debe **volver al listado**
   (cerrar el editor) (D-11.22).
6. Abrir la consulta → tab **Récipe** (ya no "Prescripción"): NO debe haber textarea de
   "Tratamiento/Indicaciones" duplicado (vive en el modal) (D-11.18).
7. Tab **Reposo:** diagnóstico **precargado** del tab diagnóstico; "desde" = **hoy**; campo
   **Comentarios** opcional; botón **descarga el PDF directo** (no abre otra pestaña) (D-11.19).
8. Llenar todos los tabs → **Generar/Compartir documento:** "Informe médico" debe estar
   **HABILITADO** (no "Sin bloques de consulta con contenido") (D-11.20). Descargar → el PDF
   tiene **nombre legible** y abre bien (D-11.21).
9. **Compartir:** generar enlace + código → abrir como paciente → descargar → PDF branded con
   nombre legible (D-11.21).
10. **Consultorios → Nuevo:** teléfono con selector +58 (D-11.10); dejar **un solo bloque** y
    guardar → NO carga infinita (D-11.12); provocar solape → error **en español, DENTRO del
    modal**, indicando el día (D-11.11). Cerrar haciendo click **afuera** → NO debe cerrar (D-11.13).

### D-11.x — Matriz de casos (cada uno = observación del usuario). Front (A) + BD/efecto (B):

| Caso    | Flujo / acción                                        | Criterio de PASA (verificar pantalla SIGUIENTE, no solo la actual)                                                                                                                                                                              |
| ------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-11.1  | Teléfono paciente: teclear >10 dígitos                | Muestra error de formato y **conserva** el valor; NO limpia el campo. Probar (a) empezar con 414 completo (válido) y agregar 1 díg → NO borra; (b) empezar con 212 y exceder → NO borra. Bug del "eco": emitir '' al padre reescribía el campo. |
| D-11.2  | Crear paciente desde modal de consulta (StepPatient)  | Sexo envía `male`/`female`/`other` (no `masculino`/`femenino`). Si falla validación, el banner muestra el **campo específico** (no "Validation failed" genérico).                                                                               |
| D-11.3  | Inicio → crear paciente → "Crear cita ahora"          | Modal-pregunta se cierra; se abre "Nueva consulta" con paciente preseleccionado. **Un solo modal**.                                                                                                                                             |
| D-11.4  | Crear cita → redirige a Consultas                     | La consulta recién creada **aparece** en el listado (abre por `appointment_id`). B: fila en `consultations`.                                                                                                                                    |
| D-11.5  | Citas "por confirmar" (scheduled)                     | Aparecen en Consultas con badge **"Por confirmar"**; no se filtran fuera.                                                                                                                                                                       |
| D-11.6  | Crear consulta desde botón de Consultas               | Recarga **solo la tabla**, NO refresca toda la página; la nueva fila aparece.                                                                                                                                                                   |
| D-11.7  | Finanzas "Por ingresar" con consulta sin pago         | Monto ≠ $0 (usa `COALESCE(c.amount, a.plan_price)`). B: query de pending > 0.                                                                                                                                                                   |
| D-11.8  | Plan Free → botones Ingreso/Cobros/Gasto              | NO abren modal funcional; muestran aviso "Disponible en Delta Base" + link a /doctor/upgrade.                                                                                                                                                   |
| D-11.9  | Sidebar en plan Free                                  | **Finanzas** y **Marketing** muestran **candado** (igual que Agenda), no solo Agenda.                                                                                                                                                           |
| D-11.10 | Consultorio: campo teléfono                           | Usa el mismo PhoneInput (+58) que registro de paciente. ⚠️ ojo fijos (212…): reportar si no guarda.                                                                                                                                             |
| D-11.11 | Consultorio: solape de horario                        | Error **en español**, **dentro del modal** (no toast detrás), indicando el **día**.                                                                                                                                                             |
| D-11.12 | Consultorio: dejar un solo bloque y guardar           | NO carga infinita; guarda o muestra error claro; `saving` siempre se resetea.                                                                                                                                                                   |
| D-11.13 | Cualquier modal: click fuera (backdrop)               | **NO cierra**; solo cierra con botón Cancelar / X. (offices, services, patient-requests, generar/compartir doc).                                                                                                                                |
| D-11.14 | Bloques de consulta: orden y default                  | Los **fijos** aparecen **primero** y **habilitados** por defecto.                                                                                                                                                                               |
| D-11.15 | Bloque "Prescripción"                                 | Se muestra como **"Récipe"** en bloques, tab, tipos de documento y PDF. B: `consultation_block_catalog.default_label='Récipe'`.                                                                                                                 |
| D-11.16 | Plantillas: 5 tipos                                   | Informe, Récipe, Indicaciones, Paraclínicos, Reposo (exactamente esos 5).                                                                                                                                                                       |
| D-11.17 | Plantillas: "Ver preview" + "Descargar ejemplo"       | Preview NO queda en negro (remonta al cambiar de tab, con loading); descarga PDF con **nombre del documento**.                                                                                                                                  |
| D-11.18 | Detalle consulta: tab Récipe                          | NO tiene textarea "Tratamiento/Indicaciones" duplicado (vive en el modal de documento).                                                                                                                                                         |
| D-11.19 | Detalle consulta: tab Reposo                          | Diagnóstico precargado; "desde"=hoy; campo Comentarios opcional; botón **descarga PDF directo** (no otra pestaña).                                                                                                                              |
| D-11.20 | Generar/Compartir documento con tabs llenos           | "Informe médico" **HABILITADO** (considera el estado vivo del editor, no solo snapshot).                                                                                                                                                        |
| D-11.21 | Descargar PDF (doctor y paciente/compartir)           | El archivo tiene **nombre legible** (`Informe-<código>.pdf`, `Documentos-<código>.pdf`) y abre como PDF válido.                                                                                                                                 |
| D-11.22 | Menú izq. "Consultas" desde el editor de una consulta | Vuelve al **listado** (cierra el editor). Los links del menú siempre van a su ruta base.                                                                                                                                                        |

> **Cierre del método:** un caso NO es PASA si solo "no dio error" en la pantalla donde se ejecutó.
> A debe navegar a la pantalla donde el efecto debe verse (Consultas, Finanzas, PDF descargado) y
> confirmarlo; B confirma persistencia y ausencia de errores en logs/Sentry. Probar como **un médico
> real haciendo su día completo**, no acciones sueltas.

---

## D-2026-07-12) Lote QA récipe/booking/finanzas/sentry

> Cobertura del lote **2026-07-12** (todo desplegado en prod). Reusa el entorno prod y el harness de BD de las
> secciones **Entorno** y **B**. Convención: `doctorId` de `user.sub`; PII de paciente NUNCA en claro en logs.
> **Regla del proyecto:** un caso PASA solo si el efecto se ve en la **pantalla siguiente** (no basta con "la UI
> no dio error"). Commits de referencia en `05-progress-log.md` (sección 2026-07-12).

### D-12.a — Récipe / Consultas

| Caso   | Precondición                                   | Acción                                                    | Esperado front                                                                                                                                                             | BD / efecto                                                                       |
| ------ | ---------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D-12.1 | Consulta con récipe (≥1 medicamento con dosis) | Generar / descargar récipe                                | PDF de **2 hojas**: hoja 1 "Récipe" (medicamento + dosis); hoja 2 "Indicaciones" (medicamento+dosis+indicaciones+frecuencia+duración+**presentación**)                     | —                                                                                 |
| D-12.2 | Récipe compartido por enlace + código          | Abrir como paciente y descargar                           | Mismo PDF de 2 hojas branded "Delta Salud"                                                                                                                                 | `shared_document_links` activo; sin PII en logs                                   |
| D-12.3 | Editar medicamento en el récipe                | Elegir **Presentación** (preset o "Otro" libre) y guardar | El valor persiste y sale en la hoja 2                                                                                                                                      | `SELECT presentation FROM prescriptions WHERE id=:p` = valor elegido (snake_case) |
| D-12.4 | Consulta con bloque de evaluación              | Abrir tabs de la consulta                                 | El bloque antes "Indicaciones" ahora se llama **"Evaluación actual"**; NO aparece "Indicaciones" como documento suelto en Generar/Compartir ni en la preview de plantillas | `consultation_block_catalog.default_label` = "Evaluación actual"                  |
| D-12.5 | Récipe recién editado, tras un deploy reciente | Guardar receta                                            | NO error "Server Action not found"; guarda vía route handler `/api/doctor/prescriptions`                                                                                   | fila `prescriptions` persistida                                                   |
| D-12.6 | Reposo SIN días (días=0)                       | Intentar generar/compartir reposo                         | **Deshabilitado**; NO se genera aunque fecha (hoy) y diagnóstico estén prefilled                                                                                           | —                                                                                 |
| D-12.7 | Reposo con días >0                             | Generar reposo                                            | Genera el PDF                                                                                                                                                              | —                                                                                 |
| D-12.8 | Editor de una consulta                         | "Ver ficha del paciente"                                  | Abre **modal de solo lectura** (identidad, contacto, clínicos, emergencia, notas); NO saca del editor de la consulta                                                       | ninguna escritura                                                                 |
| D-12.9 | Informe con **bloques fijos** + dinámicos      | Reordenar bloques fijos con ↑↓ y generar informe          | El orden de los fijos manda en el informe (no solo los dinámicos)                                                                                                          | backend ordena por `sort_order` sin distinguir fijos                              |

### D-12.b — Validaciones

| Caso    | Precondición                 | Acción                                        | Esperado front                                                         | BD / efecto |
| ------- | ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| D-12.10 | Selector de horario, hoy     | Intentar elegir una **hora ya pasada** de hoy | Bloqueada/no seleccionable (hora de **Venezuela**); solo horas futuras | —           |
| D-12.11 | Registro/edición de paciente | Poner fecha de nacimiento **futura**          | Rechaza (`lib/date-validation.ts`)                                     | no persiste |
| D-12.12 | Registro de especialista     | Fecha de nacimiento con edad **<18 años**     | Rechaza; exige mínimo 18                                               | no persiste |

### D-12.c — Config / Pagos

| Caso    | Precondición               | Acción                                                                                                 | Esperado front                                                                                                                       | BD / efecto                                                |
| ------- | -------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| D-12.13 | Settings → Métodos de pago | Buscar la tasa de cambio                                                                               | Vive en una **sección compacta** (`ExchangeRateSection`) dentro de Métodos de pago; NO hay pantalla `/doctor/settings/exchange-rate` | —                                                          |
| D-12.14 | Settings → Métodos de pago | Ver las opciones de pago                                                                               | Son **colapsables** (acordeón)                                                                                                       | —                                                          |
| D-12.15 | Consultorio nuevo/editar   | Agregar **"Enlace de ubicación (Google Maps)"** y guardar; luego confirmar una cita en ese consultorio | El correo de confirmación al paciente incluye "Ver ubicación en el mapa"                                                             | `doctor_offices.map_url` guardado (http/https, sanitizado) |

### D-12.d — Finanzas / Cobros

| Caso    | Precondición                  | Acción                                  | Esperado front                                                                        | BD / efecto                                               |
| ------- | ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| D-12.16 | Consultas pendientes de pago  | Abrir Cobros                            | El **listado no sale vacío**; los montos coinciden con el dashboard                   | `SUM(COALESCE(c.amount, a.plan_price, 0))` de pending > 0 |
| D-12.17 | Finanzas → Ingresos/Egresos   | Agregar/editar/eliminar una transacción | El listado **se refresca** al instante (mecanismo `refreshKey`)                       | fila creada/editada/borrada en `financial_transactions`   |
| D-12.18 | Finanzas → Resumen / Ingresos | Ver gráfico "Ingresos vs Gastos"        | Es de **barras (recharts)**, como en Reportería                                       | —                                                         |
| D-12.19 | Dashboard del doctor          | Leer el KPI de consultas                | Dice **"Consultas atendidas"** (valor = total de consultas), no "Pacientes atendidos" | —                                                         |

### D-12.e — Booking del paciente

| Caso    | Precondición                                            | Acción                                            | Esperado front                                                                                      | BD / efecto                                          |
| ------- | ------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| D-12.20 | Doctor con datos de pago cargados                       | Abrir el link público de reserva y llegar al pago | Se muestran los **datos de pago del doctor** (nro de cuenta, Pago Móvil, etc.), no solo los métodos | `GET /api/booking/:id/info` incluye `paymentDetails` |
| D-12.21 | Doctor con **multi-bloque** el mismo día (mañana+tarde) | Ver los horarios disponibles                      | Muestra **todos los bloques del día** en el mismo orden que ve el doctor (no solo el primero)       | slots union de todos los bloques                     |
| D-12.22 | Paciente ya existente (misma cédula)                    | Reservar de nuevo con esa cédula                  | Dedup por **cédula primero**; asocia sin **sobrescribir** los datos existentes                      | no se crea duplicado; datos previos intactos         |
| D-12.23 | Paso "Tus datos"                                        | Ver el orden de campos                            | La **cédula va primero**; **NO** aparece el botón "Prefiero iniciar sesión"                         | —                                                    |
| D-12.24 | Reserva completada con comprobante                      | Completar el booking; revisar Cobros del doctor   | Aparece un pago `pending` con el comprobante en la cita, en el área de cobros                       | `payments` fila `status='pending'` ligada a la cita  |

### D-12.f — Onboarding / Marca / Mobile / Sentry

| Caso    | Precondición                           | Acción                      | Esperado front                                                                                                                                   | BD / efecto                                           |
| ------- | -------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| D-12.25 | Especialista en su **primer** registro | Completar el registro       | Recibe **correo de bienvenida** con paso a paso de cómo usar Delta (solo la 1ª vez)                                                              | plantilla `welcome` enriquecida; gate primer registro |
| D-12.26 | Doctor SIN logo/firma                  | Entrar al inicio del doctor | Aparece la **tarjeta guía** para configurar plantillas (subir logo/firma)                                                                        | desaparece cuando ya tiene logo/firma                 |
| D-12.27 | Cualquier pantalla / email / PDF       | Revisar el branding         | Dice **"Delta Salud"** en todos lados (ya no "Delta Medical CRM")                                                                                | —                                                     |
| D-12.28 | Landing en **móvil** (`landing.html`)  | Tocar la **hamburguesa**    | El menú abre; login/registro accesibles en celular                                                                                               | —                                                     |
| D-12.29 | Sentry (post-deploy)                   | Observar eventos            | Cesa el ruido de "Server Action not found" del bell admin; `getRecentDoctors` es route handler `/api/admin/recent-doctors` (polling best-effort) | `ignoreErrors` filtra ruido benigno                   |
| D-12.30 | Aplicar config de plantillas a todos   | "Aplicar a todos"           | NO error `INVALID_TEMPLATE_TYPE`; usa los **4 tipos válidos** (informe/recipe/prescripciones/reposo)                                             | —                                                     |

---

## D-2026-07-12b) Lote PRUEBAS 12-07 (Finanzas/Cobros/Servicios/Recordatorios) + admin/planes/bloques + fix de deploy

> Cobertura del lote de la **tarde del 2026-07-12** (correcciones sobre el doc `PRUEBAS 12-07.txt` + bugs
> reportados en vivo). Todo desplegado tras arreglar un **boot roto de Cloud Run** (ver D-12b.f). Misma regla:
> un caso PASA solo si el efecto se ve en la **pantalla siguiente**. Commits: `9611030`..`6a56022`
> (detalle en `05-progress-log.md`, sección 2026-07-12).

### D-12b.a — Servicios y Recordatorios

| Caso    | Precondición                        | Acción                                          | Esperado front                                                                                             | BD / efecto                                              |
| ------- | ----------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| D-12b.1 | `/doctor/services`, crear/editar    | Ver el formulario del servicio                  | **NO** aparece el campo "Duración (min)"; tampoco en la tarjeta del servicio                               | duración real vive en `doctor_offices.slot_duration`     |
| D-12b.2 | `/doctor/reminders`, cita con email | Enviar recordatorio por **Email**               | El cuerpo del email trae **emojis** (👋📅🕐📋🔖🏥), igual que el de WhatsApp                               | mailto con emojis codificados                            |
| D-12b.3 | `/doctor/reminders`, varias citas   | Usar el **selector de fecha** (día de consulta) | La lista filtra a las consultas de **ese día**; "Seleccionar todos" + "Enviar a N" para masivos de ese día | chips Hoy/1d/3d/7d limpian el filtro por día y viceversa |

### D-12b.b — Cobros (drawer de pago)

| Caso     | Precondición                                       | Acción                                      | Esperado front                                                                                              | BD / efecto                                                        |
| -------- | -------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| D-12b.4  | Consulta cuyo pago se **aprobó desde la consulta** | Abrir Cobros → pestaña **Aprobados**        | La consulta aparece en Aprobados (antes salía todo "pendiente" y Aprobados vacío)                           | `payments.status='approved'` sincronizado desde la consulta        |
| D-12b.5  | Cobros                                             | Ver los filtros arriba                      | Existe **"Todas"** además de Pendientes/Aprobados; las **cajas de resumen** cambian según el filtro         | —                                                                  |
| D-12b.6  | Detalle de un pago pendiente                       | Cambiar el estatus                          | **Un solo botón** con la acción contraria (pendiente→aprobado / aprobado→pendiente)                         | `payments.status` toggle                                           |
| D-12b.7  | Detalle de un pago pendiente                       | Cambiar la **fecha de pago**                | Precarga la **tasa BCV de ese día**; recalcula el monto en Bs; si no hay tasa avisa "ingrésala manualmente" | `GET /api/settings/bcv-rate?date=` (cache `bcv_rate_history`)      |
| D-12b.8  | Detalle de un pago pendiente                       | Editar método/referencia + guardar detalles | "Guardar detalles" persiste; refresca la lista                                                              | `PATCH /api/finances/payments/:id/details`; sincroniza la consulta |
| D-12b.9  | Detalle de un pago                                 | "**Añadir paquete/servicio**"               | Abre el modal, agrega el servicio y el **total sube**                                                       | fila en `payment_items`                                            |
| D-12b.10 | Detalle de un pago                                 | "**Generar recibo PDF**"                    | Genera el recibo (si el popup se bloquea, abre por Blob URL con aviso)                                      | —                                                                  |

### D-12b.c — Finanzas (4 tabs)

| Caso     | Precondición              | Acción                      | Esperado front                                                                                                                                | BD / efecto                                                                                                    |
| -------- | ------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D-12b.11 | Finanzas → **Resumen**    | Ver la tab                  | **3 cajas de ingreso** (consultas cobradas / pendientes / manuales) + **6 cajas de gasto por concepto**; SIN "Registrar ingreso"              | `summary.incomeBreakdown` + `summary.expenseBreakdown`                                                         |
| D-12b.12 | Finanzas → Resumen        | "**Agregar gasto**"         | Abre un **modal** (monto, concepto, descripción, fecha), no campos inline                                                                     | `POST /api/finances/expense` con `concept`; `expense_concept` persistido                                       |
| D-12b.13 | Finanzas → Resumen        | Descargar **CSV**           | Trae los 3 consolidados de ingreso, los 6 de gasto por concepto y el balance                                                                  | —                                                                                                              |
| D-12b.14 | Finanzas → **Ingresos**   | Ver la tab                  | Mantiene "Registrar ingreso"; **sin** cajas de resumen; gráfica por **tipo de ingreso**; tabla con TODOS los ingresos del mes + CSV detallado | `GET /api/finances/income` paginado                                                                            |
| D-12b.15 | Finanzas → **Gastos**     | Ver la tab                  | Botón **"Registrar gasto"** (mismo modal, con concepto); gráfica **por concepto**; tabla de movimientos; sin resumen                          | —                                                                                                              |
| D-12b.16 | Finanzas → **Reportería** | Ver el detalle por consulta | **Hora, Modalidad y Duración ya NO en blanco**; el **monto** ya no sale $0                                                                    | `with-patient` trae `scheduled_at`/`appointment_mode`/`duration_minutes` + `COALESCE(c.amount,a.plan_price,0)` |
| D-12b.17 | Finanzas → Reportería     | Usar filtros                | Filtro por **tipo** (ingresos por consulta / manuales / gastos), **mes** y **paginador**; sin botón "Registrar ingreso"                       | —                                                                                                              |

### D-12b.d — Admin y Planes

| Caso     | Precondición                             | Acción                              | Esperado front                                                                             | BD / efecto                                                                 |
| -------- | ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| D-12b.18 | Admin → Especialistas → **Nuevo médico** | Completar y "Crear médico"          | **NO** aparece "Failed to parse URL"; crea el médico correctamente                         | `POST /api/admin/doctors` vía `backendPost` (URL absoluta)                  |
| D-12b.19 | Admin → Nuevo médico, email ya existente | Crear con un correo ya registrado   | Error **en español**: "Ya existe una cuenta registrada con el correo …"                    | `DoctorEmailConflictError` (409)                                            |
| D-12b.20 | Registrar/asignar plan **Free Trial**    | Doctor free_trial entra a su cuenta | Funciona **igual que Delta Plus**, incluido el **booking online**; se corta a los ~30 días | mig 000012 espeja `plan_features` de delta_plus; cap por downgrade perezoso |

### D-12b.e — Bloques de consulta (2 bugs)

| Caso     | Precondición                                                          | Acción                                                        | Esperado front                                                                                      | BD / efecto                                                      |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| D-12b.21 | En `/doctor/settings/consultation-blocks` quitar varios y **guardar** | Volver a una consulta y usar el "+" para **agregar 1** bloque | Se agrega **solo el seleccionado**; los que estaban quitados **siguen fuera** (no reaparecen todos) | el PUT preserva `doctor_config` completo (incl. `enabled=false`) |
| D-12b.22 | Módulo de bloques                                                     | Mirar la esquina superior derecha de cada ítem                | **NO** aparece el nombre interno en inglés (gris) del bloque                                        | —                                                                |

### D-12b.f — IA y fix de despliegue (técnico)

| Caso     | Precondición                     | Acción                                        | Esperado front                                                                                                    | BD / efecto                                                            |
| -------- | -------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| D-12b.23 | Consulta con un bloque con texto | "Mejorar redacción" (modos)                   | Modos mejorar/formal/acortar/ampliar; la salida **no** repite el nombre del campo ni comillas                     | `sanitizeImproveBlockOutput`                                           |
| D-12b.24 | **Deploy** (post-push)           | Observar el arranque del backend en Cloud Run | El contenedor **arranca** (antes fallaba "failed to start and listen on PORT" desde el commit de servicios extra) | `ConsultationExtraItemModel` registrado en payments + ai-transcription |

---

> Mantener este guion vivo: cuando aparezca un bug de prod, agregar una fila a la
> **Sección D** y un caso al módulo correspondiente para que el qa-agent lo cubra siempre.
