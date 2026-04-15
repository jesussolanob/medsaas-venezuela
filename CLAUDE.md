# MedSaaS Venezuela — Contexto del Proyecto

## Qué es este proyecto
SaaS multi-tenant para médicos especialistas en Venezuela.
CRM médico omnicanal con IA, gestión clínica y financiera.

## Stack técnico
- Next.js 15 + TypeScript + Tailwind CSS
- Supabase (Auth + DB + Storage)
- Shadcn/ui + Lucide React
- Desplegado en Vercel

## Estructura de rutas
- /admin → Super Administrador
- /doctor → App del Médico
- /patient → Portal del Paciente
- /invite/[token] → Acceso por invitación

## Diseño
- Colores: blanco, turquesa (teal-500), gris slate
- Fondo: bg-slate-50
- Tarjetas: bg-white border border-slate-200 rounded-xl
- Botones primarios: bg-teal-500 text-white
- NUNCA usar fondos negros ni oscuros

## Base de datos (Supabase)
Tablas: profiles, subscriptions, leads, appointments, payments,
reminders_settings, reminders_queue, ehr_records, prescriptions,
doctor_invitations, doctor_patient_links, subscription_payments

## Modelo de suscripciones
- Plan FREE: 30 días de trial gratis, se suspende automáticamente al vencer
- Plan PRO: $20 USD/mes, pago por Pago Móvil o Transferencia (Venezuela)
- Al vencer PRO sin pago → cuenta suspendida automáticamente
- El médico sube comprobante → super admin lo verifica → activa 30 días más
- Notificaciones al médico: 7 días antes, 3 días antes, 1 día antes del vencimiento
- Función en DB: check_expired_subscriptions() — verificar diariamente

## Notificaciones de vencimiento al médico
- 7 días antes → WhatsApp + Email
- 3 días antes → WhatsApp + Email  
- 1 día antes → WhatsApp + Email
- Al suspenderse → Email con instrucciones de pago

## Lo que ve el médico sobre su suscripción
- Banner amarillo cuando quedan menos de 7 días
- Banner rojo cuando quedan menos de 3 días
- Página bloqueante cuando está suspendido con botón para subir comprobante

## Lo que está hecho
- [x] Schema SQL completo en Supabase
- [x] Tabla subscription_payments
- [x] Función check_expired_subscriptions()
- [x] Login page (/login)
- [x] Super Admin layout con sidebar blanco/turquesa
- [x] Dashboard Admin con KPIs en tiempo real
- [x] Página de Médicos (/admin/doctors)
- [x] Página de Suscripciones (/admin/subscriptions)
- [x] Página de Recordatorios (/admin/reminders)
- [x] Página de Configuración (/admin/settings)

## Lo que falta por hacer
- [ ] Modal crear médico desde admin (form completo)
- [ ] Activar/suspender médico desde admin
- [ ] Verificar pagos de suscripción desde admin
- [ ] App del Médico completa (CRM, agenda, finanzas)
- [ ] Banner de aviso de vencimiento en portal médico
- [ ] Página bloqueante cuando suscripción suspendida
- [ ] Portal del Paciente
- [ ] Sistema de invitaciones por link único
- [ ] Edge Function para recordatorios automáticos
- [ ] Cron job para check_expired_subscriptions()

## Credenciales y servicios
- Supabase URL: https://azsismbgfanszkygzwaz.supabase.co
- Super Admin: jesussolano4@gmail.com
- GitHub: jesussolanob
- Precio Plan Pro: $20 USD/mes
- Método de pago: Pago Móvil / Transferencia bancaria Venezuela