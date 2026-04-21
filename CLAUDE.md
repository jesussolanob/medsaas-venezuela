# MedSaaS Venezuela — Delta Medical CRM

## Qué es este proyecto
SaaS multi-tenant para médicos especialistas en Venezuela.
CRM médico omnicanal con gestión clínica, agenda, finanzas y portal de pacientes.
Nombre comercial: **Delta Medical CRM**.

## Stack técnico
- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Supabase (Auth + PostgreSQL + Storage + RLS)
- Lucide React (iconos)
- Desplegado en Vercel
- Repo: github.com/jesussolanob/medsaas-venezuela

## Diseño y estilo
- Colores: blanco, turquesa (teal-500), gris slate
- Fondo global: bg-slate-50
- Tarjetas: bg-white border border-slate-200 rounded-xl
- Botones primarios: bg-teal-500 text-white rounded-lg
- Gradiente hero: linear-gradient(135deg, #00C4CC 0%, #0891b2 100%) → clase .g-bg
- Font: Inter (Google Fonts)
- NUNCA usar fondos negros ni oscuros
- Idioma UI: español (Venezuela), locale es-VE para fechas

## Estructura de rutas

### /admin — Super Administrador
- layout.tsx → Sidebar con navegación admin
- page.tsx → Dashboard con KPIs en tiempo real
- /doctors → Lista de médicos + NewDoctorModal + NewClinicModal
- /patients → **NUEVO** Estadísticas globales de pacientes (edad, email, consultas)
- /subscriptions → Gestión de suscripciones
- /plans → Activar/desactivar planes (plan_configs table)
- /plan-features → Configurar features por plan
- /reminders → Configuración de recordatorios
- /settings → **SIMPLIFICADO** Solo gestión de admins + tasa BCV
- /roles → Gestión de roles
- ~~/approvals~~ → ELIMINADO (beta privada — acceso inmediato)
- ~~/finances~~ → ELIMINADO (beta privada — redirige a /admin)

### /doctor — App del Médico
- layout.tsx → Sidebar con feature gating basado en plan_features
- page.tsx → Dashboard con 3 KPIs (ingresos, pacientes, atendidos) + citas del día + finanzas
- /agenda → Calendario + modal detalle con botones: Confirmar / Marcar atendida / Cancelar / No asistió
- /patients → Lista de pacientes
- /consultations → Listado de consultas médicas
- /consultations/[id] → **NUEVO** Vista con bloques dinámicos según plantilla del doctor
- /ehr → Historial clínico electrónico
- /finances → Finanzas del médico (gated por plan_features)
- /billing → Facturación
- /reports → Reportería con filtros de fecha
- /crm → CRM de leads
- /reminders → Recordatorios
- /messages → Mensajes con pacientes
- /invitations → Invitaciones por link único
- /services → **ÚNICA PÁGINA** de tarifas/planes del doctor (ex pricing_plans)
- /settings → Configuración del médico (perfil, booking, pagos)
- /settings/consultation-blocks → **NUEVO** Configurar bloques de consulta personalizados
- ~~/plans~~ → REDIRIGE a /doctor/services (consolidado)

### /patient — Portal del Paciente
- layout.tsx → Sidebar con navegación paciente
- page.tsx → Dashboard con próxima cita, paquetes activos con info del doctor + link para agendar
- /appointments → Historial de citas
- /reports → Informes médicos
- /prescriptions → Recetas
- /messages → Chat con doctor
- /profile → Perfil personal + datos médicos
- /login → Login de paciente
- /register → Registro de paciente

### /book/[doctorId] — Booking público
- page.tsx → Server component que carga datos del doctor
- BookingClient.tsx → Formulario tipo ACORDEÓN con 5 pasos:
  1. Tipo de consulta (plan) — detecta paquetes activos prepagados
  2. Fecha (selector de días + horarios disponibles)
  3. Modalidad (presencial / online)
  4. Método de pago (se salta si usa paquete prepagado)
  5. Confirmación con resumen

### /register — Registro de médicos
- Formulario unificado con selector de 4 planes inline
- Planes se cargan dinámicamente de plan_configs table
- Email de verificación al registrar

### /login — Login unificado
- Redirige según rol: super_admin→/admin, patient→/patient, doctor→/doctor
- Si no hay perfil, revisa user_metadata.role del auth

### APIs (/app/api/)
- /api/book → Crear cita con validación de duplicados, paquetes y slots
- /api/doctor/schedule → GET/POST config de agenda y disponibilidad
- /api/doctor/consultations → CRUD de consultas
- /api/admin/* → Acciones admin

## Base de datos (Supabase)

### Tablas principales
- profiles → id, full_name, email, role, specialty, professional_title, clinic_id, clinic_role, payment_methods, payment_details, avatar_url, allows_online, office_address, city, state
- subscriptions → doctor_id, plan, status (trial|active|past_due|suspended), current_period_end
- plan_configs → plan_key (trial|basic|professional|clinic), name, price, trial_days, is_active, sort_order
- plan_features → plan (FK plan_configs.plan_key), feature_key, enabled
- appointments → doctor_id, patient_id, auth_user_id, scheduled_at, status, plan_name, plan_price, payment_method, package_id, session_number, appointment_mode
- patients → doctor_id, auth_user_id, full_name, cedula, phone, email, source
- patient_packages → doctor_id, patient_id, auth_user_id, plan_name, total_sessions, used_sessions, status (active|completed)
- consultations → doctor_id, patient_id, consultation_code, consultation_date, chief_complaint, diagnosis, treatment
- ehr_records → patient_id, consultation_id, doctor_id, diagnosis, treatment_plan
- prescriptions → patient_id, doctor_id, medication_name, dosage, frequency, duration
- patient_messages → patient_id, body, direction (patient_to_doctor|doctor_to_patient)
- pricing_plans → doctor_id, name, price_usd, duration_minutes, sessions_count, is_active
- leads, reminders_settings, reminders_queue, doctor_invitations
- ~~subscription_payments, payments, waitlist, doctor_patient_links, appointment_reminders_config~~ → ELIMINADAS (refactor 2026-04-21)

### Feature keys disponibles
dashboard, agenda, patients, consultations, ehr, finances, billing, reports, crm, reminders, messages, invitations, settings

### Taxonomía de estados (aclarada 2026-04-21)

**Estado de CITA** (`appointments.status`):
- `scheduled` → **Agendada** (recién creada)
- `confirmed` → **Aprobada** (doctor confirma la cita)
- `cancelled` → **Rechazada** (cita cancelada antes de ocurrir)

**Estado de CONSULTA** (también `appointments.status`, pos-cita):
- `completed` → **Paciente asistió** (cuenta como ingreso)
- `no_show` → **No asistió** (no restituye paquetes)

**Estado de PAGO** (`consultations.payment_status`):
- `pending` → **Pendiente**
- `approved` → **Aprobado**
- ❌ NO existe `rechazado` — un pago simplemente sigue pendiente hasta que llegue
- ❌ NO existe `cancelled` — se eliminó en migración 026

**Quién cambia cada estado:**
- Cita (scheduled→confirmed/cancelled): doctor o admin, botón en modal de agenda
- Consulta (completed/no_show): doctor, botón "Marcar como atendida" / "No asistió"
- Pago (pending→approved): doctor desde /doctor/cobros o dentro de la consulta

**Auditoría:** todo cambio en `appointments.status` se registra en `appointment_changes_log` con actor_id, old_value, new_value, timestamp. Trigger automático.

**Reagendar citas:** sólo via RPC `reschedule_appointment` que valida ownership + conflictos.

## Modelo de suscripciones — Beta Privada (simplificado 2026-04-21)
- **Trial Beta Privada**: $0, **1 año gratis** automático
- **Basic**: $10 USD/mes (configurado en BD pero NO en uso durante beta)
- **Professional**: $30 USD/mes (configurado pero NO en uso durante beta)
- **Clinic**: $100 USD/mes (configurado pero NO en uso durante beta)

### Flujo de suscripción (beta privada)
1. Médico se registra en /register → subscription status='active', plan='trial', 1 año gratis
2. **NO hay flujo de aprobaciones** — el módulo /admin/approvals fue eliminado
3. **NO hay flujo de comprobantes de pago** — durante beta el acceso es gratis
4. Admin puede activar/desactivar planes desde /admin/plans (cuando se lance pago)
5. Admin configura features por plan desde /admin/plan-features

### Cuando se lance el modelo de pago (post-beta)
- Reactivar el módulo de aprobaciones (revertir commit del 2026-04-21)
- Reintroducir tabla subscription_payments + endpoints aprovechando backup_20260421
- Implementar Edge Function para procesamiento de pagos automático

### Feature gating en el doctor layout
- El sidebar lee plan_features para mostrar/ocultar módulos
- Status válidos: 'active', 'trial', 'trialing'
- Si status inválido: solo dashboard, agenda, settings
- Dashboard verifica plan_features para link de finanzas (no usa plan name)

## Modelo de paquetes de paciente
- Paciente compra plan de varias sesiones → se crea patient_package
- Al agendar desde paquete: se salta paso de pago, API valida ownership + sesiones disponibles
- API usa optimistic lock (eq used_sessions) para prevenir race conditions
- Paquete se auto-completa cuando used_sessions >= total_sessions
- Panel paciente muestra paquetes con nombre del doctor y link para agendar

## Validaciones del booking (/api/book)
- Previene citas duplicadas (mismo paciente + mismo horario ± 15 min)
- Previene slots ocupados (otro paciente ya tomó ese horario)
- Valida paquete: ownership, doctor correcto, status active, sesiones disponibles
- Optimistic lock en used_sessions para prevenir sobre-uso concurrente

## Login y roles
- super_admin / admin → /admin
- patient → /patient/dashboard
- doctor (incluye clinic admin) → /doctor
- Si no hay perfil en profiles, se usa user_metadata.role del auth
- Pacientes registrados via /patient/register usan signUp client-side con metadata role:'patient'

## Credenciales y servicios
- Supabase URL: https://azsismbgfanszkygzwaz.supabase.co
- Super Admin: jesussolano4@gmail.com
- Doctor de prueba: ing.jesussolanob@gmail.com
- GitHub: jesussolanob
- Métodos de pago: Pago Móvil, Transferencia, Zelle, Binance, Efectivo USD/Bs, POS

## Especialidades disponibles
Cardiología, Dermatología, Endocrinología, Gastroenterología, Ginecología y Obstetricia, Medicina General, Medicina Interna, Nefrología, Neurología, Oftalmología, Ortopedia y Traumatología, Otorrinolaringología, Pediatría, Psicología, Psiquiatría, Reumatología, Fisioterapia, Urología, Centro de Salud, Clínica General, Otra

## Lo que está hecho
- [x] Schema SQL completo en Supabase con RLS
- [x] Login unificado con redirección por rol
- [x] Registro de médicos con 4 planes + verificación email
- [x] Super Admin completo (dashboard, médicos, suscripciones, planes, features, recordatorios, settings)
- [x] Admin puede activar/desactivar planes dinámicamente
- [x] Admin puede configurar features por plan
- [x] Doctor layout con feature gating dinámico
- [x] Doctor dashboard con citas del día + finanzas del mes
- [x] Doctor agenda completa (semana/mes/día + disponibilidad + aprobaciones)
- [x] Doctor pacientes, consultas, EHR, finanzas, facturación, reportería
- [x] Doctor CRM, recordatorios, mensajes, invitaciones
- [x] Doctor settings (perfil, booking link, planes de precio, métodos de pago)
- [x] Booking público tipo acordeón con auth + planes + slots + pago + comprobante
- [x] Sistema de paquetes prepagados con validación server-side
- [x] Portal paciente con dashboard, citas, informes, recetas, mensajes, perfil
- [x] Paquetes activos del paciente con info del doctor + link para agendar
- [x] Sidebar doctor: "Mi Clínica" para clinic admin, "Upgrade" para resto
- [x] Banner de vencimiento de suscripción (amarillo/rojo)

## Lo que falta por hacer
- [ ] Página bloqueante cuando suscripción suspendida (vista completa)
- [ ] Edge Function para recordatorios automáticos (WhatsApp + Email)
- [ ] Cron job para check_expired_subscriptions()
- [ ] Integración WhatsApp Business API
- [ ] Notificaciones push / email transaccionales
- [ ] Portal de clínica (gestión de múltiples médicos)
- [ ] Reportes PDF descargables para pacientes
- [ ] Tests unitarios y E2E
