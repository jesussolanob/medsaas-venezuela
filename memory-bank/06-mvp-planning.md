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

| # | Ítem | Estado | Notas |
|---|------|--------|-------|
| 7.1 | Landing: quitar botón paciente del nav; contador real de especialistas; "Cómo funciona" 3 pasos; especialidades comunes VE; pricing 3 planes (Free Trial, Especialista $30, Clínica contacto) | pendiente | |
| 7.2 | Dashboard admin: `GET /admin/dashboard/stats` (especialistas total/activos/fríos/inactivos, citas 30d, pacientes, gráficas crecimiento, CxC) | pendiente | activo/frío/inactivo según last_sign_in |
| 7.3 | Especialistas con estados (Activo ≤7d, Frío 7-30d, Inactivo >30d) + vencimiento + export Excel/PDF | pendiente | |
| 7.4 | Tasa USDT/Binance: `POST /admin/settings/usdt-rate`, `GET /settings/usdt-rate` (público), Redis TTL 10m, mostrar USD+Bs en booking | pendiente | |
| 7.5 | Dashboard especialista: botones Registrar Pago/Gasto; notif citas 30m antes (WS); "Cita actual" destacada | pendiente | |
| 7.6 | Agenda: quitar filtros de pago; filtros Completadas/Canceladas; KPIs (horas consulta, MoM, promedio/día, mejor día) — deseable | pendiente | |
| 7.7 | Consultorio: historial → abrir consulta lectura/edición; seguimientos/adjuntos; datos médicos editables en consulta activa | pendiente | parcialmente existe (cita-360) |
| 7.8 | Plantillas PDF: tabla `doctor_templates` (encabezado, logo, firma, sello, pie, matrícula, tipografía, color, tamaño); `POST /doctor/templates`; Informe/Recipe/Indicaciones; `@react-pdf/renderer` | pendiente | tabla ya existe |
| 7.9 | Finanzas: sección "Por ingresar"; ingresos no-consulta asociados a paciente; corregir gráfica (bug) | pendiente | |
| 7.10 | Cobros: filtro estado consulta; botón cobro WhatsApp (mensaje pre-formateado + link pago) | pendiente | |
| 7.11 | Servicios: campo descripción (se muestra en booking) | pendiente | |
| 7.12 | BD limpieza: ocultar ID de cita en UI; eliminar campos marcados | pendiente | |

## Fase 9 (observabilidad/notificaciones) — habilitadores

Sentry, GA4, Helicone (costos IA), Resend (email — ya en uso), Twilio (WhatsApp),
recordatorios automáticos (Cloud Scheduler). Estado: pendiente.

## Reglas de priorización

1. La migración de arquitectura (Fases 1-3) precede a cualquier feature MVP nueva.
2. Cada feature nueva entra como controller/use-case en el backend NestJS, nunca
   como query directa a Supabase en el frontend.
3. Actualizar el estado de cada ítem al iniciarlo y completarlo, con fecha.
