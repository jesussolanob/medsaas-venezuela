# 06 — MVP Planning

> **Fuente de verdad para priorización.** Antes de implementar CUALQUIER
> funcionalidad nueva, verificar que está aquí. Si no está, agregarla con
> justificación de negocio antes de codificar.
>
> Estados: `pendiente | en-progreso | completado | descartado`
> Origen: master-plan.md Fase 7 (mapeo MVP Delta Saas). El detalle completo del
> MVP vive en `Delta_Medical_CRM_Roadmap_MVP.pptx` / `Delta-MVP-Resumen-Ejecutivo.pptx`.

## Prerrequisito transversal: migración a la nueva arquitectura

Fases 0-3 (NX + shared-types + backend NestJS) son base de todo lo de abajo.
Estado: Fase 0 ✅ · Fase 1 en-progreso.

## Ítems MVP (Fase 7)

| #    | Ítem                                                                                                                                                                                               | Estado      | Notas                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 7.1  | Landing: quitar botón paciente del nav; contador real de especialistas; "Cómo funciona" 3 pasos; especialidades comunes VE; pricing 3 planes (Free Trial, Especialista $30, Clínica contacto)      | completado  | "Cómo funciona"/Especialidades ya existían; contador real ✅; paciente OCULTO (no removido)                                  |
| 7.2  | Dashboard admin: `GET /admin/dashboard/stats` (especialistas total/activos/fríos/inactivos, citas 30d, pacientes, gráficas crecimiento, CxC)                                                       | pendiente   | activo/frío/inactivo según last_sign_in                                                                                      |
| 7.3  | Especialistas con estados (Activo ≤7d, Frío 7-30d, Inactivo >30d) + vencimiento + export Excel/PDF                                                                                                 | completado  | estados+CSV ya estaban; +export PDF tabular (@react-pdf) + badge visual de vencimiento                                       |
| 7.4  | Tasa USDT/Binance: `POST /admin/settings/usdt-rate`, `GET /settings/usdt-rate` (público), Redis TTL 10m, mostrar USD+Bs en booking                                                                 | pendiente   |                                                                                                                              |
| 7.5  | Dashboard especialista: botones Registrar Pago/Gasto; notif citas 30m antes (WS); "Cita actual" destacada                                                                                          | pendiente   |                                                                                                                              |
| 7.6  | Agenda: quitar filtros de pago; filtros Completadas/Canceladas; KPIs (horas consulta, MoM, promedio/día, mejor día) — deseable                                                                     | pendiente   |                                                                                                                              |
| 7.7  | Consultorio: historial → abrir consulta lectura/edición; seguimientos/adjuntos; datos médicos editables en consulta activa                                                                         | pendiente   | edición vive en `/doctor/consultations/[id]` (cita-360 eliminado 2026-06-23)                                                 |
| 7.8  | Plantillas PDF: tabla `doctor_templates` (encabezado, logo, firma, sello, pie, matrícula, tipografía, color, tamaño); `POST /doctor/templates`; Informe/Recipe/Indicaciones; `@react-pdf/renderer` | completado  | render + export con `@react-pdf/renderer` en el front; falta sello/font_size (follow-up)                                     |
| 7.9  | Finanzas: sección "Por ingresar"; ingresos no-consulta asociados a paciente; corregir gráfica (bug)                                                                                                | completado  | patient_id en ingresos + gráficas fieles (incluyen manuales)                                                                 |
| 7.10 | Cobros: filtro estado consulta; botón cobro WhatsApp (mensaje pre-formateado + link pago)                                                                                                          | completado  | botón WhatsApp con monto USD+Bs + datos de pago del doctor; sin pasarela. Filtro estado consulta OMITIDO (no pedido)         |
| 7.11 | Servicios: campo descripción (se muestra en booking)                                                                                                                                               | pendiente   |                                                                                                                              |
| 7.12 | BD limpieza: ocultar ID de cita en UI; eliminar campos marcados                                                                                                                                    | en-progreso | "ocultar ID de cita" DESCARTADO (usuario: dejar `appointment_code` visible). Falta del usuario: lista de columnas a eliminar |

## Avance 2026-06-12 (commits en `feature/migracion-backend`, QA pendiente)

- **7.1** Landing: **contador real de especialistas** ✅ (`GET /api/public/stats`); pricing ya era dinámico.
  Falta: "Cómo funciona" 3 pasos, especialidades VE, quitar botón paciente del nav. → en-progreso.
- **7.2** Dashboard admin: estados Activo/Frío/Inactivo **reales** (con `last_sign_in_at`) + KPIs pacientes/CxC/
  expiring cableados. → casi completo.
- **7.3** Especialistas: estados reales + **export CSV** ✅ (Excel-compatible). Falta export PDF + vencimiento UI.
- **7.4** Tasa USDT/Binance ✅ **completado** (dual Binance P2P + BCV + manual, admin elige, refresco perezoso).
- **7.5** Dashboard especialista ✅: botones **Registrar pago** (atajo a /doctor/cobros) y **Registrar gasto**
  (modal → addExpense); **"Cita actual/próxima"** destacada; recordatorio "30 min antes" **por calendario**
  (Google event reminders popup+email + `VALARM` en el .ics — sin polling/WS). Decisión del usuario: calendario, no polling.
- **7.6** Agenda KPIs ✅ **completado** (horas de consulta, promedio/día, mejor día).
- **7.7** Consultorio: historial **editable** con bloques dinámicos que persisten (`blocks_snapshot`). Falta
  seguimientos/adjuntos. → en-progreso.
- **7.9** Finanzas "**Por ingresar**" ✅ (CxC = pagos pending, dashboard+finanzas). Falta ingresos no-consulta + bug gráfica.
- **7.11** Servicios: **descripción en booking** ✅ **completado**.
- Extra (no-MVP): downgrade de plan **al login** (sin cron); Google `event_id` cancelable; timezone de citas (Caracas).

## Avance 2026-06-18 (commits en `feature/migracion-backend`, QA con guion 07)

- **Bug citas (`57ede68`):** `hasOverlap` usaba `ANY` (SQL inválido) → fix `IN`. Crear citas/consultas vuelve a andar.
- **#12 Compartir documentos** ✅ front+back: enlace público + código 6 dígitos + **cédula** (48h), PDF (pdf-lib),
  email Resend. Fixes `?sessionToken=`, `APP_BASE_URL`, doble factor cédula+código.
- **Planes Free/Base/Plus** fijados (legacy desactivados); **gating** afinado (Free mínimo) + feature `booking`
  nueva (Free sin reservas online).
- **Suscripción**: panel de plan permanente corregido (sin "termina el null"), botón Mejorar → `/doctor/upgrade`,
  plan actual resaltado en upgrade; handler envuelto en `{success,data}`.
- **IA de texto** reactivada (improve/summarize/historial) — backend `/api/ai/text` + BFF DESPLEGADOS (commit `b25522b`, 103 tests). 🚨 BLOQUEADA por Google: la key de Gemini da 403 "project denied access" → toda IA (incl. transcripción) da 502 hasta que el usuario arregle el acceso a Gemini (otra cuenta/proyecto, billing o región).
- **alert() → toast** en 12 pantallas.

## Fase 9 (observabilidad/notificaciones) — habilitadores

Sentry, GA4, Helicone (costos IA), Resend (email — ya en uso), Twilio (WhatsApp),
recordatorios automáticos (Cloud Scheduler). Estado: pendiente.

## GRUPO A — APIs nuevas para paridad con el proyecto original (✅ COMPLETO 6/6 — 2026-06-05)

> Tras migrar doctor/patient/login fuera de Supabase, faltaban endpoints backend que el
> proyecto original tenía (63 route handlers en `app/api/*`). Grupo A = lógica de negocio
> pura (solo Postgres). **Grupo B = Auth0 ✅ integrado** (env-gated). Grupo C = servicios
> externos: **email/Resend ✅ y storage MinIO/GCS ✅**; pendientes IA/PDF/calendar/cron/pasarela.

Grupo A — **✅ completo:**
**payments(cobros) ✅ · billing ✅ · leads/crm ✅ · suggestions ✅ · subscriptions-ops ✅ ·
promotions ✅ · agenda-slots ✅ · consultation-blocks ✅ · exports CSV ✅ · admin-config ✅
(roles/admins, plan-edit, app-settings) · capabilities ✅ (RBAC DB-driven).**
**reminders → DIFERIDO** (envío real WhatsApp/email + cron; solo `reminders_settings` CRUD ahora).
**🎉 BLOQUE FRONTEND-WIRING COMPLETO (2026-06-04):** suggestions (doctor+admin) ✅ · leads/crm ✅ ·
admin aprobaciones de pagos ✅ · admin/invoices ✅ · consultations register-payment ✅ · doctor/billing ✅.
Commits a7ba116, 027f3ba, ee215ff, d225dff, a96fd12, db221fe. Todo cableado al backend, sin Supabase.
Para billing se construyó el endpoint backend `GET /api/consultations/with-patient` (PII descifrada,
owner-scoped) que faltaba. Backend: build/lint verdes, 920/920 tests, dist bootea, curl real verificado.

**🎉 CABLEO FRONTEND CAPABILITIES + AGENDA (2026-06-04):** gating por capabilities en sidebars doctor/admin/
patient (consume `getMyCapabilities`+`can`, deny-all, sin flash) · UI `/admin/roles` = editor de la matriz
role-capabilities (toggles optimistas + refresh de caché) con route handlers thin-proxy nuevos · reschedule
de cita cableado (`/api/doctor/reschedule` → `PUT /api/appointments/:id/reschedule`) · thin-proxy de
`toggle-doctor` (suspend/reactivate) y `setup-promotions` deprecado. Review cycle: code-reviewer +
security-agent → 0 CRITICAL/HIGH. tsc 0, código nuevo sin errores eslint. Detalle en 05-progress-log.
**ADMIN DATA-PAGES ✅ (2026-06-04):** doctor-details (backend ampliado: phone/cedula/city/state + stats),
subscription-stats (nuevo `GET /admin/subscriptions/growth`), plan-features (frontend-only) — todo cableado,
review 0 CRITICAL/HIGH. **PENDIENTE:** booking slots (offices vs schedules — pase dedicado) + handlers sin
backend/dev-tooling (change-plan, toggle-subscription, settings-data, invoice-pdf/send-invoice, fix-role, seed).

> HALLAZGO (2026-06-03): hay DOS sistemas de pago. `consultation_payments` (secundario, 1 caller:
> consultations page) = módulo `payments`. `payments`+`payment_items` (PRINCIPAL, fuente de verdad
> financiera de cobros/dashboard/finanzas, ver `lib/finances.ts`) = construido EN el módulo `finances`.
> Ambos backends ✅. El frontend de cobros/dashboard/finanzas usa el PRINCIPAL → cablear ese.

- **payments (cobros) — ✅ BACKEND HECHO (commit a5d8dee, 2026-06-03):** módulo DDD
  `apps/backend/src/modules/payments/` + migración `20260603000000-consultation-payments.cjs`.
  Endpoints: `GET/POST /api/doctor/payments`, `PUT /api/doctor/payments/:id/{approve,reject}`.
  Anti-IDOR (doctorId de user.sub + ownership de consulta), transacciones (sync consultation.payment_status),
  sin PII (solo patient_id). 61 tests verdes, dist bootea. **Pendiente: cablear el frontend** (cobros +
  `app/api/doctor/payments` route handler) a estos endpoints. NO confundir con `subscription_payments` (→ billing).

### `billing` — ✅ BACKEND HECHO (commit 60ba1df, 2026-06-04)

Módulo `apps/backend/src/modules/billing/` + mig. `20260603000002-billing.cjs` (4 tablas:
subscription_payments, invoices, billing_documents, subscription_changes_log). Endpoints:
`GET/PUT /api/admin/subscription-payments` (+:id/approve,:id/reject, super_admin), `POST/GET/PUT
/api/admin/invoices` (+:id/paid, super_admin), `GET/POST /api/doctor/billing` (doctor, anti-IDOR).
`approveAndExtend`: transacción de 5 pasos (marca pago→extiende subscriptions.current_period_end→
sincroniza profiles snapshot→log) coherente con sequelize-admin.repository. 141 tests dirigidos + 799
suite; dist bootea; curl real 200; RBAC verificado (doctor→403). Diferido Fase 5: emails, PDF factura,
subscription-ops standalone (suspend/reactivate/extend manual). **Pendiente: cablear frontend**
(admin payments/invoices pages + doctor/billing page).

#### (investigación original billing, ya implementada)

Dominio entrelazado con subscriptions — diseñar fronteras con cuidado. Tablas nuevas:

- `subscription_payments` (doctor paga la plataforma): id, doctor_id, amount_usd, method,
  reference_number, duration_months, status(pending|approved|rejected), reviewed_by, reviewed_at,
  created_at. Aprobar → EXTIENDE la suscripción (`extendSubscription`: subscriptions +
  `subscription_changes_log`) + email (Fase 5). Reemplaza admin/payments(+approve/reject).
- `invoices` (admin factura al doctor): ver `app/api/admin/invoices` + mark-invoice-paid + send-invoice(email F5).
- `billing_documents` (docs del doctor): `app/api/doctor/billing` (GET/POST).
  Incluye lógica de subscriptions-ops (extend/reactivate/suspend) que comparte `extendSubscription` +
  `subscription_changes_log` → considerar construir `subscription_changes_log` (tabla nueva) aquí.
  Diferido Fase 5: emails (sendPaymentApprovedEmail), PDF de factura (invoice-pdf).

## MÓDULO DOCTOR "vendible" — Fases 1–8 (✅ 2026-06-11/12) — pagos manuales

> Cierre del módulo doctor para hacerlo vendible. Equipo de agentes; review 0 CRITICAL/HIGH por fase.

| Fase | Ítem                                                                                      | Estado                         | Notas                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Planes parametrizables desde admin (role_key, is_permanent, precios por período, keys IA) | completado                     | `plan_prices` + `GET /api/plans` público. Free/Base/Plus.                                                                                                                                                                                                                                                                                              |
| 1    | Gating doble (role_capabilities ∩ plan_features) + upsell `/doctor/upgrade`               | completado                     | Candado → upgrade. Downgrade perezoso a Free sin perder datos.                                                                                                                                                                                                                                                                                         |
| 2    | Registro de doctor + verificación admin (mpps/colegiado, verification_status)             | completado                     | `POST /api/doctor/registration`; panel `/admin/verifications`.                                                                                                                                                                                                                                                                                         |
| 3    | Maestra de identidad de paciente (interna, por cédula)                                    | completado                     | `patient_identities`; no expone existencia cross-doctor.                                                                                                                                                                                                                                                                                               |
| 4    | Consultorios con modalidad + Google Calendar/Meet opt-in                                  | completado                     | Fallback `.ics`/Jitsi. Google probado real. meet_link en citas.                                                                                                                                                                                                                                                                                        |
| 5    | Agenda: bloqueos de disponibilidad + horizonte de semanas                                 | completado                     | `availability-blocks`; `booking_horizon_weeks` en slots.                                                                                                                                                                                                                                                                                               |
| 5    | Servicios/planes y citas asociados a consultorio (office_id)                              | completado                     | `GET /api/doctor/services?officeId`.                                                                                                                                                                                                                                                                                                                   |
| 6    | QR descargable del link público de booking                                                | completado                     | Componente `BookingQrCode`.                                                                                                                                                                                                                                                                                                                            |
| 7    | IA con Gemini (transcripción + texto: mejorar/resumir/historial)                          | funciona local; prod pendiente | Código completo y desplegado. **QA local 4/4 OK (2026-06-19)** con key de **cuenta personal @gmail** (el bloqueo era la cuenta Workspace `deltasalud.app`, no la región). Gating por plan OK (IA solo en Plus). **PROD aún da 502** (Secret Manager tiene la key Workspace denegada) → poner key personal o migrar a Vertex. Ver `ia-gemini-decision`. |
| 8    | Telemetría por sesión (1 fila/sesión, journey JSON + PiiGuard)                            | completado                     | `telemetry_sessions` reemplaza `action_events`.                                                                                                                                                                                                                                                                                                        |
| —    | Onboarding obligatorio post-SSO (cédula V/E/P, especialidad obligatoria)                  | completado                     | Gate full-screen; `/register`→`/login` (Auth0).                                                                                                                                                                                                                                                                                                        |
| —    | Especialidades en BD (catálogo gestionable, seed 29)                                      | completado                     | `GET /api/specialties` público.                                                                                                                                                                                                                                                                                                                        |
| —    | Verificación MPPS automática vía SACS                                                     | completado                     | Colegiado = manual (sin portal).                                                                                                                                                                                                                                                                                                                       |

**Deudas Etapa 2:** cifrar cédula del doctor; audit-log admin de PII; timezone de citas; cron de
downgrade/reminders.

## Reglas de priorización

1. La migración de arquitectura (Fases 1-3) precede a cualquier feature MVP nueva.
2. Cada feature nueva entra como controller/use-case en el backend NestJS, nunca
   como query directa a la BD en el frontend (el frontend solo proxya vía BFF).
3. Actualizar el estado de cada ítem al iniciarlo y completarlo, con fecha.

## Lote de septiembre 2026 — tres pedidos del dueño (2026-09-01)

Entran acá por la regla 1 del documento: toda feature nueva se registra antes de codificar.

| Ítem                                                                                                                                               | Justificación de negocio                                                                                                                                   | Plan                      | Estado                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| **Inventario** — catálogo de productos con stock, vendibles dentro del cobro de la consulta                                                        | El especialista que vende en el consultorio (cremas, lentes, prótesis, suplementos) hoy lo cobra por fuera del sistema: ese ingreso no aparece en finanzas | `delta_plus`              | **backend + frontend hechos** (`feature/inventario`), sin QA, sin migrar |
| **Cotizaciones / presupuestos** — servicios + productos, PDF con el branding del especialista, envío por enlace, y listado de clientes potenciales | Presupuestar es el paso previo a vender un tratamiento caro; hoy se hace por WhatsApp y no queda registro ni seguimiento                                   | `delta_plus`              | spec listo (`docs/specs/cotizaciones.md`), sin empezar                   |
| **Chatwoot para vendedores** — WhatsApp con un usuario por vendedor                                                                                | El médico no ve el celular personal del vendedor y, si el vendedor se va, **la cartera se queda**. Hoy no hay registro de qué se conversó                  | — (no es feature de plan) | runbook listo (`docs/specs/chatwoot-vendedores.md`), bloqueado por Meta  |

**Decisiones del dueño en este lote:** ambos módulos solo en Plus · el inventario guarda **solo
precio de venta**, sin costo de proveedor (no hay margen ni valorización) · stock en cero **avisa,
no bloquea** · la cotización se manda **por enlace**, no adjunta.

**Dependencia dura:** cotizaciones incluye productos, así que inventario va primero.

**Lo que la cotización va a destapar de paso:** el módulo **CRM está construido, gateado y no está
en el menú lateral** — igual que `ehr`, `billing`, `reports`, `messages` e `invitations`. El listado
de clientes potenciales es la puerta natural para volverlo alcanzable, y hay que sacarle la
auto-siembra de 8 leads de demostración antes de que convivan con prospectos reales.

## Lote de pagos de paquete — dos pedidos del dueño (2026-09-10)

Entran acá por la regla 1 del documento: toda feature nueva se registra antes de codificar.

| Ítem                                                                                                                                                                      | Justificación de negocio                                                                                                                                                               | Plan                      | Estado                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| **Una sesión de paquete no vuelve a pedir cobro** — las consultas 2..N de un paquete ya pagado se muestran como cubiertas, con el plan y el pago que las cubre a la vista | Hoy la pantalla pide confirmar el pago **otra vez** en cada sesión de un paquete que ya se cobró completo. El especialista no sabe si ya cobró, y replicar el cobro infla las finanzas | — (no es feature de plan) | **backend + pantalla listos** (`feature/consultas-paquete-pagado`), falta QA en navegador  |
| **Cambiar el servicio de una consulta** — corregir el plan mal elegido por el paciente, con cascada a monto, cita y pago                                                  | El paciente se equivoca al elegir el paquete en el booking público y hoy **no hay forma de corregirlo**: queda cobrado el servicio que no era, y la única salida es rehacer la cita    | — (no es feature de plan) | **implementado** (`feature/cambiar-servicio-consulta`) — falta correr la migración y el QA |

**Decisiones del dueño en este lote (2026-09-10):**

1. **Los extras van a un cobro APARTE por consulta.** El pago del paquete queda cerrado en su monto;
   los productos de inventario y costos adicionales de cada sesión generan su propio cobro, solo por
   los extras. Se implementa con `base_amount = 0` en las sesiones cubiertas (`total = base + Σ extras`).
2. **Al cambiar el servicio de una consulta ya cobrada, el pago se ajusta de monto y SIGUE aprobado**
   (no vuelve a `pending` como sí hace la multa del ADR-031). Es la opción cómoda para el
   especialista; para que la diferencia no quede sin rastro, el cambio deja **asiento en
   `appointment_changes_log`** con monto anterior, monto nuevo y autor.
3. **Solo se permite cambiar entre servicios equivalentes** — mismo `sessions_count`. Simple ↔ simple,
   paquete de 4 ↔ paquete de 4. Así no hay que crear ni borrar preconsultas, ni decidir qué pasa con
   sesiones ya agendadas.
4. **La consulta cubierta NO muestra monto propio**: dice "Cubierta por: Paquete X — $120, pagado el
   …". Mostrar $120 en cada una de las 4 se lee como $480.
5. **El especialista tiene que ver SIEMPRE qué servicio contrató el paciente**, con o sin monto: un
   consultorio puede tener varios planes y por el monto solo no se distingue cuál es.

**Hallazgos de la investigación previa (2026-09-10):**

- El modelo de "un pago, N consultas" **ya existe**: el booking crea las sesiones adicionales con
  `amount: 0` ("Price already collected on the first session") y `payment_id` compartido, y al
  aprobar el pago un `UPDATE ... FROM appointments WHERE a.payment_id = :paymentId` sincroniza todas
  las consultas hermanas. Lo que falta es propagar el estado **al agendar**, porque ese UPDATE solo
  alcanza a las sesiones que ya existían cuando se aprobó.
- **Son TRES los caminos** que agendan una sesión de paquete y los tres tienen el mismo defecto:
  `schedule-pending-consultation` (especialista), `schedule-pending-consultation-by-token` (paciente
  desde el correo) y `create-immediate-appointment` (inmediata que consume sesión). Arreglar uno solo
  repite el error del ADR-032 y el ADR-035. **Verificado al implementar:** el camino del paciente
  (`…-by-token`) **delega** en `schedule-pending-consultation`, así que se arregló solo; hubo que
  tocar los otros dos.
- **El bloque que mostraba el plan en la consulta nunca se vio.** No estaba solo escondido detrás de
  una condición: `appointmentData` es siempre `null` — los tres caminos que abren una consulta hacen
  `setAppointmentData(null)`. Plan, monto y método de la cita eran código muerto. Se reemplazó por
  `plan_name`, que ahora viaja en la respuesta de consulta.
- **El nombre del plan ya se guarda** en las sesiones de paquete (`planName: entity.planName`), pero
  la UI lo esconde: el bloque que lo pinta está detrás de
  `(appointmentData.payment_method || appointmentData.plan_price)`, y esas sesiones nacen con ambos
  en `null` justamente por estar pagadas.
- **`appointments` no tiene `plan_id`** — solo el snapshot `plan_name`/`plan_price`. El repositorio de
  consultas une el plan **por nombre** (`AND pp.name = a.plan_name`, tres veces): dos servicios
  homónimos o uno renombrado devuelven el plan equivocado. `plan_id` es prerrequisito del ítem 2 y
  arregla esa unión de paso.

**Cierre del ítem 2 (2026-09-10):** implementado como `PATCH /api/appointments/:id/service` +
modal en el panel de la consulta. Decisiones que se tomaron al construirlo:

- **Entrada por la consulta**, no por la agenda: ahí se ve el cobro, el estado y la cobertura del
  paquete al mismo tiempo.
- **Se permite con la consulta ya atendida.** El error se descubre casi siempre después; bloquearlo
  dejaba sin salida al caso más común.
- **Alcanza al paquete entero.** No es preferencia: el sistema une las sesiones POR NOMBRE del plan,
  así que dejar una con el nombre viejo parte el paquete y rompe el rótulo "2 de 3", el total y las
  preconsultas.
- **Los bolívares del pago se recalculan con la tasa congelada del propio pago**, no con la de hoy —
  coherente con el lote de cobros del 09/09.
- ⚠️ **La migración `20260910000001` NO se ejecutó**: no hay Postgres levantado en la máquina. Va en
  la próxima ventana de QA, ANTES de cualquier deploy (una migración rota bloquea todos).
