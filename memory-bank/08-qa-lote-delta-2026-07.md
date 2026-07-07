# 08 — QA Lote DELTA (tester, 2026-07-03)

> Segundo lote de QA del tester sobre plan **delta_base** (marcoviajes11 en prod).
> Estado: `TODO` | `INVESTIGANDO` | `FIX` | `VERIFICADO-LOCAL` | `DEPLOYED`.
> Ojo: algunos pueden estar YA resueltos por el deploy del lote anterior (commits
> 6fa58aa + 29a9cc6) — verificar antes de re-arreglar.

## MEJORAS DE BOOKING/AGENDA — DESPLEGADAS (2026-07-07, commits `06ca02c` back + `b00f8c7` front, deploy `28836385275`)

Tres mejoras pedidas por el usuario. Migración `20260706000001` (2 columnas en `doctor_schedules`) corrió en prod OK.

1. **Motivo de consulta opcional + toggle del médico** (default: opcional). Columna `booking_require_reason`.
   Toggle "Requerir motivo de consulta" en /doctor/agenda (panel Disponibilidad). El booking público exige
   el motivo solo si está activo. El doctor agendando internamente (`/api/doctor/appointments`) lo salta vía
   `skipPatientBookingRules`. Error de dominio `ChiefComplaintRequiredError` (400).
2. **Sin consultorio → exigir crearlos** (NO se hizo "online por defecto", decisión del usuario). Se mantiene
   que el booking requiere consultorios; se agregó **alerta prominente en el inicio del doctor** (tarjeta teal
   - CTA "Crear consultorio" → /doctor/offices) cuando no hay consultorios activos.
3. **Anticipación mínima (lead time)**. Columna `booking_min_lead_days` (0–90, default 0). Campo "Días de
   anticipación mínima" junto a "Semanas visibles" en /doctor/agenda. `get-available-slots` oculta fechas
   antes de `hoy + N días` (día-granularidad Caracas); `create-booking` valida (error `BookingTooSoonError`,
   400); el doctor interno lo salta. Frontend: `generateSlots` arranca en `max(1, minLeadDays)`.

Config viaja por `POST /api/doctor/schedule` (mismo endpoint que el horizonte); el BFF `api/doctor/schedule/route.ts`
mapea los 2 campos en ambas direcciones. Booking público recibe `requireReason`+`minLeadDays` vía `GetBookingDoctorInfo`.

**VERIFICACIÓN**: build backend (123 tests del área, incluye lead-time + require-reason + skip-interno) y build
frontend VERDES; migración corrió en prod; los 3 controles RENDERIZAN bien en prod (/doctor/agenda). ⚠️ PENDIENTE
de verificar EN VIVO (bloqueado por entorno, NO por código): (a) persistencia round-trip y (b) efecto en booking
público — el **ID token de Auth0 de la sesión Playwright venció** (~1h; el back rechaza con `AUTH0_TOKEN_INVALID`
401 → el guardado no persistió en la prueba), y (c) lucas es plan **Free** → su booking público está gated
("Reservas en línea no disponibles"). Para cerrar el live check: re-login Auth0 fresco + probar con un doctor con
plan que incluya `booking` (o subir lucas a Base/Plus en la BD).

## QA EN PRODUCCIÓN — HECHO ✅ (2026-07-06, cuenta lucas@deltasalud.app)

QA exhaustivo en **prod real** (Cloud Run) con Playwright + Gmail (`lucas@deltasalud.app`) +
conexión directa a Cloud SQL (cloud-sql-proxy). URL prod: `https://delta-frontend-knliodnwza-ue.a.run.app`.
Se encontraron y arreglaron **6 bugs de prod** (2 redeploys, ambos success: runs `28802121774` y
`28810055164`). Commits de fix: `05bd709`, `090dd96` (+ los de Fase 3 previos).

### 🔴 Bugs de prod encontrados → arreglados → desplegados → VERIFICADOS en vivo

1. **Storage privado roto** (adjuntos pacientes/recibos): faltaba permiso `iam.serviceAccounts.signBlob`
   para firmar V4 signed URLs en Cloud Run. **Fix por IAM** (NO código): se dio rol
   `roles/iam.serviceAccountTokenCreator` al SA `delta-backend-sa` sobre sí mismo. Ya vivo.
2. **Storage público roto** (avatar/logo): el bucket `delta-files-*` tiene **Uniform Bucket-Level
   Access (UBLA)** → rechaza ACL por objeto (`public:true`), crasheaba TODAS las subidas públicas con
   error `[object Object]`. **Fix en código** (`gcs-storage.adapter.ts`): sin ACL; público y privado se
   sirven por signed URL v4 (privado 1h, público 7d). No se puede hacer el bucket público (guarda PII).
3. **`GET /api/patients/:id` → 404**: faltaba el route handler BFF `app/api/patients/[id]/route.ts`
   (solo existía el de lista). Rompía "Nueva consulta" con paciente pre-seleccionado (wizard atascado
   en paso 1). Fix en código.
4. **Doctor no podía crear consultas si el plan no incluye `booking`** (Free): el flujo interno
   "Nueva consulta" posteaba al endpoint de booking PÚBLICO (gateado). **Fix (decouple)**: nuevo
   `DoctorBookingController` `POST /api/doctor/appointments` autenticado (AppAuthGuard, anti-IDOR
   doctor_id=user.sub) que llama `CreateBookingUseCase(dto, { skipBookingFeatureGate:true })`.
   `useAppointmentFlow` postea ahí; el booking público (`/api/book`) sigue gateado (premium).
5. Log de storage `[object Object]` → extrae `err.message` real.
6. _(FALSA ALARMA)_ Finanzas "registrar ingreso" — SÍ persiste (balance sumó $50+$75=$125). El chequeo
   inicial fue un falso positivo. Nota UX: los ingresos manuales cuentan en el Balance pero la lista
   "Ingresos (Pagos aprobados)" muestra solo pagos de consultas (conceptos separados).

### 💳 MODELO DE PLANES (aprendido — CRÍTICO para futuros cambios)

El plan efectivo lo determinan **`profiles.plan` + `profiles.subscription_status`** (columnas en
`profiles`). La tabla `subscriptions` es **legacy/ignorada** por el gating. Con `subscription_status`
= NULL, la lógica de **downgrade perezoso** (`get-doctor-features-v2.use-case.ts`) baja a `delta_free`.
Para cambiar el plan de un doctor: `UPDATE profiles SET plan='delta_plus', subscription_status='active'
WHERE id=<doctorId>`. Planes activos: `delta_free`, `delta_base`, `delta_plus` (clinic inactivo).
`plan_features` por plan; gating = role_capabilities ∩ plan_features. Cache Redis DESHABILITADO en prod
(REDIS_DISABLED=true) → el cambio se refleja sin reiniciar.

- Cloud SQL: `sodium-shard-499116-r3:us-east1:delta-db`, db `deltamedical`, user `delta`, pass en Secret
  Manager `DB_PASSWORD`. Conectar con cloud-sql-proxy `--token $(gcloud auth print-access-token)`
  (la ADC del proxy da `invalid_rapt`; el token del CLI sí sirve).

### ✅ Verificado funcionando en prod (por plan)

- **Free**: login SSO, crear paciente (cédula V/E/P + parentesco + país + opcionales), pop-up post-alta
  "Crear consulta", ficha, **patient-requests** (solicitud + email real con link de PROD + portal 2FA +
  **subida de adjunto a storage privado end-to-end**: fulfilled, signed URL 1h sirve 200, sin firma 403),
  **Nueva consulta completa** (consultorio, slots reales, solo-métodos-activados + datos de cuenta,
  "pagar después", **crea la cita con office_id** vía el endpoint desacoplado), guardar métodos de pago
  (emojis OK), **subir avatar** (signed URL 7d sirve 200), crear Servicio, registrar ingreso, Cobros,
  Google Calendar CONECTADO (OAuth).
- **Base**: gating correcto (todo menos IA).
- **Plus**: badge + IA desbloqueada y **funcional** — asistente/resumen de historial (Gemini responde),
  chat de ayuda, **generar informe PDF** (PDF válido, era el bug de "próximamente"), **compartir
  documentos** (enlace + email), botón "Grabar consulta" (transcripción) desbloqueado.

### ✅ RESUELTO + VERIFICADO EN VIVO — "inconsistencia" de emails = DOS bugs encadenados (2026-07-06)

La "inconsistencia" NO era Resend caprichoso. El correo de **confirmación de cita NUNCA se enviaba** por
**dos bugs encadenados** (el 2º solo visible en runtime — el fix del 1º era necesario pero insuficiente):

1. **Plantilla faltante** (commit `6da5c0d`, deploy `28823079100`). `appointment-notification.service.ts`
   pedía `appointment_confirmation_online` / `_inperson`, pero en la BD solo existía `appointment_confirmed`
   (y con placeholders camelCase que tampoco coincidían). `MailerService.findByName` lanzaba
   `EmailTemplateNotFoundError` **antes** de loguear, y un `catch {}` ciego en `sendNotification` lo tragaba.
   **Fix**: migración `20260706000000` siembra ambas plantillas (placeholders snake_case correctos:
   `patient_name`, `doctor_name`, `appointment_date`, `appointment_time`, `meet_link`/`office_name`+`office_address`);
   el `catch` ahora loguea el error real; `MailerService` registra `email_send_log` failed con
   `errorDetail='template_not_found'` (visibilidad).
2. **`MailerService` inyectado como `null`** (commit `7c4e3a4`, deploy `28827179134`) — el bug de fondo.
   En `AppointmentNotificationService` el parámetro estaba tipado `mailer: MailerService | null` con solo
   `@Optional()`. **Gotcha NestJS**: TypeScript emite `Object` como `design:paramtype` para tipos UNIÓN, así
   que Nest no resuelve el provider y `@Optional()` lo deja en `null` → log runtime `[notify] MailerService
not injected — skipping email`. **Fix**: `@Inject(MailerService)` explícito para forzar la resolución por
   token de clase (el mismo patrón que ya usaba `APPOINTMENT_NOTIFICATION_SERVICE` por idéntica razón).
   ⚠️ LECCIÓN: cualquier dependencia opcional tipada `X | null` en un constructor NestJS necesita
   `@Inject(X)` explícito, o entra como null en silencio.

**VERIFICADO END-TO-END EN PROD** (Playwright + Gmail + logs Cloud Run, 2026-07-06 ~18:28 VE): cita creada
vía `POST /api/doctor/appointments` → logs `mailer sending template='appointment_confirmation_inperson'` →
`[email:resend] sent id=39741b15-…` → **correo recibido en Gmail** (`noreply@deltasalud.app`, asunto "Cita
confirmada con Lucas Rivas — 9/7/2026", cuerpo con todos los campos, `hasRawTokens:false`). Antes del fix #2
el mismo flujo logueaba "MailerService not injected". La latencia 3min–1h de otros correos (solicitud/código)
sigue siendo entrega async Resend→Gmail (externo, "lento pero llega").

### ⚠️ ABIERTO / no verificado (para el usuario o próxima sesión)

- ✅ **RESUELTO — `POST /api/patients` → 500 con email duplicado** (era el "unexpected error" del modal que
  reportó el usuario). Causa: la tabla tiene UNIQUE `(doctor_id, email_search_hash)` pero `CreatePatientUseCase`
  solo validaba **cédula** duplicada, no email → el email repetido violaba el constraint → `SequelizeUniqueConstraintError`
  → `GlobalExceptionFilter` → 500 genérico. **Fix** (commits `209e3e6` back + `afccf88` front, ambos desplegados
  y VERIFICADOS en vivo): (a) guard de email en el use-case (mismo `hashForSearch` que el repo); (b) `save()` del
  repo traduce `SequelizeUniqueConstraintError` a `DuplicatePatientError` (409), detectando email vs cédula por el
  índice, sin loguear PII (cubre carreras); (c) `DuplicatePatientError` acepta `field:'cedula'|'email'` con mensaje
  distinto; (d) el server action `doctor/patients/actions.ts` ya NO hardcodea "esa cédula" — surfacea el mensaje
  real del backend. Verificado en el modal: sale "Ya existe un paciente con ese correo electrónico en tu listado".
- **Hora en el email de confirmación sale en UTC** (mostró 8:30 p.m. para una cita de 16:30 VE): el template
  usa `new Date(iso).toLocaleTimeString('es-VE')` sin `timeZone:'America/Caracas'` → usa la TZ del server
  (UTC). Cosmético; corregir el formateo de `appointment_time`/`appointment_date` en la notificación.
- **Datos de prueba de este QA en prod** (borrables): pacientes "QA Email Confirmacion" (céd 30778812) y
  "QA Email Confirmacion 2" (30778813) + 2 citas del 9 jul (BK-…-5E7F y BK-…-0295).
- **Modalidad online**: solo se probó presencial (`appointment_confirmation_inperson`). La plantilla online
  quedó sembrada e inyección igual; falta una prueba con `appointmentMode:'online'` (usa `meet_link`).
- **Transcripción de audio E2E**: botón desbloqueado + backend vivo, pero subir audio real no es
  automatizable por el micrófono de Playwright. Prueba manual del usuario.
- **Evento en Google Calendar end-to-end** tras crear cita: no verificado (Calendar conectado sí).
- **Plan Clinic**: su plan_config está inactivo; no probado.
- **Datos de prueba creados en prod** (borrables): paciente "QA Prod Paciente", solicitudes de
  documentos, 1 cita (8 jul), 2 ingresos ($125), servicio "Consulta QA Prod", avatar, método Pago Móvil.
- Cuenta lucas **restaurada a Free** (profiles.plan=NULL, subscription_status=NULL) al cerrar.

## ESTADO (2026-07-03) — Fases 1 y 2 DESPLEGADAS ✅

Commits en `feature/migracion-backend` (auto-deploy Cloud Run):

- **Fase 1** (6ac951d + 41e6cd9): ~22 bugs. Consulta (nombre real, estado persiste, generar
  informe, compartir email/wa, toasts), Pacientes (fecha -1d, race que borraba datos, Ver planes,
  abrir consulta), Agenda (borrar, copy Cita360, input semanas, slots bloqueados), Cobros
  pendientes (+fix UNION uuid/text), Finanzas (gráfico, timezone, +ingreso), Marketing (emojis),
  Link público (confirmar cita), **uploads arreglados en 3 módulos (causa: file-type ESM→magic bytes)**.
- **Fase 2** (2abba24 + 36d3e80 + 6564ea0): upload público real (guest, cierra 401 prod),
  parentesco (+migración 20260703000001), duplicado paciente 409, dropdown país LatAm (PhoneInput),
  costura filtro de pago agenda, widget "Por confirmar" en Inicio, registrar ingreso/cobros en Inicio,
  crear paciente (parentesco en form, datos no-demográficos opcionales, mensaje duplicado, pop-up
  "crear consulta" que no existía). Same-day auto-confirm VERIFICADO (ya cubierto).

### FASE 3 — EN CURSO

1. **Rediseño "Nueva consulta"** (`NewAppointmentFlow`) — ✅ HECHO (commit `63a3449`, sin pushear aún;
   queda a criterio del usuario desplegar tras QA visual). Monolito de 1363 líneas extraído a
   `useAppointmentFlow` + `steps/` + `appointment-flow.utils`. Nuevo orden paciente → consultorio →
   tipo (motivo opcional) → horario (slots reales del schedule + deshabilita ocupados/bloqueados) →
   pago (solo métodos activos del médico con sus datos + "Pagar después" = paymentMethod null →
   pago pending; wire real del comprobante). Firma de props y payload a `/api/book` sin cambios.
   **Bug pre-existente arreglado:** el submit enviaba `office_id` (snake) pero el BFF `/api/book`
   espera `officeId` (camel) → el consultorio NUNCA se vinculaba a la cita. Fixes de timezone
   (offset -04:00 explícito) y de gating (paquete = pago resuelto). Build verde; lint sin errores
   nuevos (el proyecto ya trae ~147 errores endémicos `react-hooks/set-state-in-effect`).
2. **"Solicitud al paciente" / Seguimiento con archivos** (feature nueva) — ✅ HECHO (commits
   `66b100b` backend + `01f0c1f` frontend; SIN pushear aún). Módulo NestJS DDD `patient-requests`
   (3 tablas, migración `20260703000002`, 7 use-cases, 7 rutas, template email `patient_request_code`,
   114 tests). El doctor crea una solicitud (título+descripción) para un paciente → email con código
   de 6 dígitos → portal público `/patient-requests/[token]` valida cédula+código (2FA oracle-safe) →
   sube adjuntos (storage PRIVADO + signed URLs; NO público) y/o responde → doctor ve respuesta +
   adjuntos. UI doctor en `/doctor/patient-requests` + botón "Solicitar docs" desde ficha del paciente.
   Verificado: build+lint+114 tests + **boot-test del dist** (DI OK, rutas mapeadas) + **migración
   corrida en la BD local** (3 tablas, template seed, CHECK/FK/índices OK). Review code+security
   aplicada (5 HIGH: oracle 404→422, audit log PHI, status 500/502, N+1). ⚠️ El backend dev en :3001
   está STALE (código viejo sin el módulo): reiniciarlo para QA visual local.

### QA LOCAL (Playwright + BD real) — HECHO ✅ (2026-07-03 noche)

Ciclo completo con navegador (dev-stub, doctor `dev@delta.local`) contra BD local:

- **patient-requests end-to-end VERIFICADO**: doctor crea solicitud → lista/toast →
  portal público valida cédula+código (código leído de BD, email stub) → muestra título+descripción
  (fix de metadata OK) → sube PDF (multipart + X-Session-Token) → submit → estado `Respondida` →
  doctor ve respuesta + adjunto con **signed URL** (X-Amz-Expires=3600). Seguridad probada: URL firmada
  200; **sin firma → 403** (privado). Estado en BD: fulfilled, content_type=application/pdf (detected).
- **Nueva consulta VERIFICADO**: nuevo orden (paciente→consultorio→tipo+motivo→horario→pago),
  tipos filtrados por consultorio, **slots reales del schedule** (días sin horario deshabilitados,
  franja 08:00–11:30 del consultorio, no los genéricos), "Pagar después" (paymentMethod null),
  y la cita **queda ligada al consultorio** (office_id) — verificado en BD.

**3 bugs encontrados y arreglados en el QA (commit `137f4b3`), que los unit tests no atrapaban:**

1. `office_id` NULL en la cita: el frontend mandaba `officeId` (fix previo del BFF) pero
   `CreateBookingUseCase` no lo pasaba a `Appointment.create()` → cableado + test de regresión.
2. `access_audit_log` de patient-requests fallaba en silencio: `field_revealed='patient_request_detail'`
   no estaba en el CHECK `access_audit_log_field_check` → migración `20260703000003` extiende el allowlist.
3. (menor) El create-patient por API exige `doctor_id` en el body aunque el backend lo sobreescribe
   del auth — observación, no bloqueante (el form real ya lo maneja).

**Nota de gating:** `/api/book` (endpoint interno y público) exige el feature `booking` del plan. El
`delta_base` LOCAL no lo tenía → 403 "Online booking is not available". En prod marcoviajes11 (delta_base)
sí crea citas, así que es artefacto del seed local (se habilitó temporalmente para el QA y se revirtió).
⚠️ Si en prod el alta interna de citas da 403 para delta_base, habilitar `booking` en ese plan.

### QA EXHAUSTIVO (cada botón + edge cases) — HECHO ✅ (2026-07-06)

Segunda pasada a pedido del usuario ("probaste cada botón y cada subida?"). La primera pasada
fue solo camino feliz; ésta ejercitó botones y bordes con Playwright + BD real. **Encontró 4 bugs
más que los unit tests (repos mockeados) no atrapaban** — todos arreglados (commit `17fe28a`):

1. Portal **"Quitar"** dejaba adjunto huérfano (subía al seleccionar; "Quitar" solo lo sacaba de la
   lista). Refactor a **staging**: se sube al enviar → "Quitar" descarta de verdad; sin huérfanos.
2. **Crear paciente inline** en Nueva consulta daba **400** (POST /api/patients sin `doctor_id`).
3. **Slots ocupados** nunca se deshabilitaban: el BFF leía `result.value.appointments` pero
   `backendGet` ya desempaqueta `data` (el array). +
4. **Carrera** que borraba los ocupados: el efecto de modalidad limpiaba `unavailableTimes` en cada
   cambio de sede, pisando lo recién cargado (la caché es por fecha y a nivel doctor).

**Casos verificados OK (sin bug):** portal — código/cédula incorrectos oracle-safe (mismo 422),
bloqueo a los 5 intentos, solicitar-nuevo-código + cooldown 60s (429), tipo inválido y >10MB
rechazados client-side, multi-archivo, magic-bytes declarado≠detectado (422), rate-limit upload
(5/60s→429), gating de envío; almacenamiento privado (signed URL 200 / sin firma 403); audit log PHI.
Nueva consulta — "Solicitar docs" desde ficha con paciente pre-seleccionado, crear disabled sin
título, 2 consultorios, modalidad oculta en sede solo-presencial, slots reales por schedule con
09:00/10:30 ocupados deshabilitados, método con referencia obligatoria, **botón real "Crear consulta"
end-to-end** con office_id + método + referencia persistidos, "Pagar después". Staged-upload happy
path revalidado (0 adjuntos antes de enviar → 1 fulfilled después).

### PENDIENTE Fase 3 (deploy + QA)

- **Push/deploy (ÚNICO pendiente)**: commits de código `63a3449`, `66b100b`, `01f0c1f`, `137f4b3`,
  `17fe28a` (+ docs) sin pushear. Al hacer push, la rama auto-deploya a Cloud Run y corre las
  migraciones `20260703000002` (patient-requests) y `20260703000003` (audit-log allowlist) contra
  Cloud SQL. QA local (camino feliz + exhaustivo de botones/bordes) ya PASÓ; queda desplegar.
- Entorno local: servers apagados, `AUTH_MODE=auth0` restaurado, toggle local de `booking` revertido.
  Para re-QA local: `AUTH_MODE=dev` en ambos .env + reiniciar backend (dist nuevo) y `nx dev frontend`.

### DIFERIDO (no en Fase 3)

- Consultorio: múltiples bloques horarios por día (#8, cambio de schema + migración).
- Deuda: rate-limit propio del endpoint backend public-upload (hoy lo cubre el BFF + ingress interno);
  wa.me solo formatea VE (los demás países no arman link).

### PARA RETOMAR (próxima sesión) — arrancar Fase 3

**Prompt sugerido:** "Seguí con Fase 3 del lote QA delta; lee `memory-bank/08-qa-lote-delta-2026-07.md`
(secciones FASE 3 y PARA RETOMAR)."

**Cómo ejecutar (patrón que funcionó todo el lote):**

1. Lead escribe spec preciso → delega a `backend-agent`/`frontend-agent` (NO Docker durante edición) →
   verifica en disco (build+lint+test) + **boot-test del dist** (los cambios de DI/mapper rompieron el
   boot 3 veces y build/unit NO lo atrapan) + curl real → code-review + security-agent si toca
   PII/auth/portal público → commit por bloques → push (auto-deploy).
2. Empezar por **investigación/diseño** (los 2 agentes que se cancelaron): mapear `NewAppointmentFlow`
   y estudiar el módulo `document-sharing` para modelar `patient-requests`. Luego implementar.
3. Sub-dividir para no chocar archivos y checkpointear por bloque desplegable (no acumular 30 cambios).

**Reutilizables ya creados en este lote (para Fase 3):**

- `POST /api/storage/public-upload` (backend, sin auth, kind=receipt) + BFF
  `app/api/storage/public-upload/route.ts` (con rate-limit por IP) → usar para los adjuntos del portal.
- `components/ui/CountryCodeSelect.tsx` + `components/shared/PhoneInput.tsx`.
- Patrón del portal público con código por correo: módulo `document-sharing` (backend + portal).

**Estado del entorno local (al cerrar 2026-07-03):**

- `apps/frontend/.env` = `AUTH_MODE=auth0` (restaurado; para QA con cookies volver a `dev` y restaurar).
- Backend dev quedó corriendo en `:3001`; Docker (postgres/redis/minio) arriba. Migraciones al día
  (incl. 20260701 backfill-subscriptions y 20260703000001 parentesco).
- Usuarios de prueba LOCAL: FREE `doctor@test.com`, BASE `dev@delta.local` (default), PLUS
  `smokedocv2@dev.local`, ADMIN `admin@smoketest.local`. Impersonar por cookies `dev_user_id`/`dev_user_role`.
- **Prod:** `marcoviajes11@gmail.com` = doctor en `delta_base` (profiles + subscriptions consistentes).
  Cloud SQL `sodium-shard-499116-r3:us-east1:delta-db`, IP pública 34.139.94.60, redes autorizadas en
  `0.0.0.0/0` (⚠️ cerrar a tu IP y rotar el password `delta` tras el QA — quedaron expuestos en chat).

## Clasificación: 🐛 bug · ✨ feature · 🎨 decisión de producto · ♻️ posible ya-arreglado

### MÓDULO INICIO

- [ ] ✨ Listado de consultas por confirmar (widget dashboard)
- [ ] ✨ Botón "registrar pago" → permitir registrar ingreso + consultas pendientes
- [ ] 🐛🎨 Crear paciente: validar duplicado · datos no-demográficos opcionales · nuevo campo "parentesco" del contacto de emergencia
- [ ] 🐛 Al crear paciente, pop-up de crear consulta: botón "crear" no funciona (solo "más tarde")
- [ ] ♻️ Consulta creada por médico / mismo día → debe nacer confirmada (auto-confirm ya implementado; VERIFICAR "mismo día")

### MÓDULO AGENDA

- [ ] 🎨 Prefijo de país editable + dropdown de países
- [ ] 🐛 Bloque de semana: no deja el input en blanco para escribir un número completo
- [ ] ♻️ No permite borrar la consulta (delete ya implementado; VERIFICAR path)
- [ ] 🐛 Detalle de consulta redirige a "Cita 360" (feature eliminada)
- [x] 🎨 Nueva consulta: reorden (paciente → consultorio → consulta asociada al consultorio → horario → método de pago) — commit 63a3449 (logo actual)
- [x] 🎨 Método de pago: botón "pagar después" + mostrar solo métodos activados por el médico con sus datos — 63a3449
- [x] 🐛 No debe mostrar horarios bloqueados — 63a3449 (slots reales del schedule, deshabilita ocupados/bloqueados)
- [ ] 🐛 Filtros (agendadas/confirmadas, pagado/pendiente) no actualizan el calendario

### MÓDULO PACIENTES

- [ ] 🐛 Guarda la fecha de nacimiento -1 día (timezone)
- [ ] 🐛♻️ No guarda dirección / datos médicos / contacto de emergencia (VERIFICAR vs fix de edición del lote previo — puede ser el flujo de CREAR)
- [ ] 🐛 Desde historial de consulta: poder iniciar la consulta o abrir el detalle
- [ ] 🐛 Historial médico: cambiar botón "Generar resumen" → "Ver planes"
- [x] ✨ Seguimiento "pedir algo al paciente" + cargar archivos → feature nueva patient-requests (portal + código por correo) — commits 66b100b + 01f0c1f

### MÓDULO CONSULTA

- [ ] 🐛 Botón "generar informe" dice "Compartir documentos disponible próximamente"
- [ ] 🐛 Compartir: email/WhatsApp dice "el paciente no tiene correo" cuando SÍ tiene
- [ ] 🐛 "Atendida" se desmarca al reingresar a la consulta
- [ ] 🎨 Cada notificación debe confirmarse con un toast
- [ ] 🐛 Muestra "Paciente" en vez del nombre del paciente

### MÓDULO CONSULTORIO

- [ ] 🐛 No se puede registrar más de un bloque de horarios por consultorio
- [ ] 🐛 Se pueden sobreescribir horarios (dos consultorios con el mismo horario)

### MÓDULO FINANZAS

- [ ] ✨ Falta botón "+ agregar ingreso" (como en gasto)
- [ ] 🐛 Gráfico de barras no se visualiza
- [ ] 🐛 Gastos registrados no se visualizan en el resumen

### MÓDULO COBROS

- [ ] 🐛 No trae el detalle de consultas pendientes (si las hay)

### MÓDULO MARKETING

- [ ] 🐛 Los emojis del mensaje no se ven (encoding)

### MÓDULO LINK PÚBLICO

- [ ] 🐛 No permite carga de imágenes
- [ ] 🐛 Confirmar cita no hace nada — Error "Validation failed" (endpoint booking público; distinto al del área doctor ya arreglado)

### MÓDULO CONFIGURACIÓN

- [ ] 🐛 No se pueden cargar imágenes
- [ ] 🎨 Prefijo de país estandarizado + editable

## Decisiones de producto (usuario, 2026-07-03)

- **Alcance: LOTE COMPLETO** — incluye las 2 features grandes: "solicitud al paciente"/seguimiento
  con archivos (portal + código por correo, modelado sobre document-sharing) y el rediseño de
  "Nueva consulta" (reorden paciente→consultorio→consulta→horario→pago + "pagar después" + solo
  métodos de pago activos del médico). Programa multi-sesión.
- **Prefijo de país:** componente compartido = dropdown LatAm (bandera + prefijo) + editable,
  default Venezuela +58. Usar en Agenda, Configuración y Pacientes.
- **Logo "nueva consulta":** usar el logo/branding actual por ahora (no bloquear por asset).

## Notas de ejecución

- Equipo de agentes (backend/frontend) + code-review/security en cambios sensibles. Lead conduce Playwright.
- Uploads de imágenes fallan en 3 módulos (link público, configuración, agenda nueva consulta) → probable causa común (storage/route handler). Investigar juntos.
- "Confirmar cita Validation failed" (público) huele al mismo patrón del DTO que exige campos server-derived en el body.
