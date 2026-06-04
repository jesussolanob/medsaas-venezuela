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

| #    | Ítem                                                                                                                                                                                               | Estado    | Notas                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------- |
| 7.1  | Landing: quitar botón paciente del nav; contador real de especialistas; "Cómo funciona" 3 pasos; especialidades comunes VE; pricing 3 planes (Free Trial, Especialista $30, Clínica contacto)      | pendiente |                                         |
| 7.2  | Dashboard admin: `GET /admin/dashboard/stats` (especialistas total/activos/fríos/inactivos, citas 30d, pacientes, gráficas crecimiento, CxC)                                                       | pendiente | activo/frío/inactivo según last_sign_in |
| 7.3  | Especialistas con estados (Activo ≤7d, Frío 7-30d, Inactivo >30d) + vencimiento + export Excel/PDF                                                                                                 | pendiente |                                         |
| 7.4  | Tasa USDT/Binance: `POST /admin/settings/usdt-rate`, `GET /settings/usdt-rate` (público), Redis TTL 10m, mostrar USD+Bs en booking                                                                 | pendiente |                                         |
| 7.5  | Dashboard especialista: botones Registrar Pago/Gasto; notif citas 30m antes (WS); "Cita actual" destacada                                                                                          | pendiente |                                         |
| 7.6  | Agenda: quitar filtros de pago; filtros Completadas/Canceladas; KPIs (horas consulta, MoM, promedio/día, mejor día) — deseable                                                                     | pendiente |                                         |
| 7.7  | Consultorio: historial → abrir consulta lectura/edición; seguimientos/adjuntos; datos médicos editables en consulta activa                                                                         | pendiente | parcialmente existe (cita-360)          |
| 7.8  | Plantillas PDF: tabla `doctor_templates` (encabezado, logo, firma, sello, pie, matrícula, tipografía, color, tamaño); `POST /doctor/templates`; Informe/Recipe/Indicaciones; `@react-pdf/renderer` | pendiente | tabla ya existe                         |
| 7.9  | Finanzas: sección "Por ingresar"; ingresos no-consulta asociados a paciente; corregir gráfica (bug)                                                                                                | pendiente |                                         |
| 7.10 | Cobros: filtro estado consulta; botón cobro WhatsApp (mensaje pre-formateado + link pago)                                                                                                          | pendiente |                                         |
| 7.11 | Servicios: campo descripción (se muestra en booking)                                                                                                                                               | pendiente |                                         |
| 7.12 | BD limpieza: ocultar ID de cita en UI; eliminar campos marcados                                                                                                                                    | pendiente |                                         |

## Fase 9 (observabilidad/notificaciones) — habilitadores

Sentry, GA4, Helicone (costos IA), Resend (email — ya en uso), Twilio (WhatsApp),
recordatorios automáticos (Cloud Scheduler). Estado: pendiente.

## GRUPO A — APIs nuevas para paridad con el proyecto original (en curso desde 2026-06-03)

> Tras migrar doctor/patient/login fuera de Supabase, faltan endpoints backend que el
> proyecto original tenía (63 route handlers en `app/api/*`). Grupo A = lógica de negocio
> pura (solo Postgres), construible YA. Grupo B = Auth0 (Fase 4). Grupo C = servicios
> externos IA/email/PDF/storage/calendar/cron/pasarela (Fase 5).

Orden grupo A — estado al 2026-06-04:
**payments(cobros) ✅ → billing ✅ → leads/crm ✅ → suggestions ✅ →**
PENDIENTE: subscriptions-ops · promotions · agenda-slots · consultation-blocks · exports CSV ·
admin-config (roles/admins, plan-edit, app-settings). **reminders → DIFERIDO Fase 5** (el envío real
es WhatsApp/email client-side; solo reminders_settings sería CRUD de bajo valor ahora).
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
**PENDIENTE admin data-pages (requieren endpoint backend nuevo, no simple proxy):** doctor-details (PII),
plan-features (por path + label), subscription-stats (growth chart) · booking slots (offices vs schedules).

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

## Reglas de priorización

1. La migración de arquitectura (Fases 1-3) precede a cualquier feature MVP nueva.
2. Cada feature nueva entra como controller/use-case en el backend NestJS, nunca
   como query directa a Supabase en el frontend.
3. Actualizar el estado de cada ítem al iniciarlo y completarlo, con fecha.
