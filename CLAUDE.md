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
- /subscriptions → Gestión de suscripciones
- /plans → Activar/desactivar planes (plan_configs table)
- /plan-features → Configurar features por plan
- /finances → Finanzas globales
- /approvals → Aprobaciones de pagos
- /reminders → Configuración de recordatorios
- /settings → Configuración general
- /roles → Gestión de roles

### /doctor — App del Médico
- layout.tsx → Sidebar con feature gating basado en plan_features
- page.tsx → Dashboard con citas del día, finanzas del mes, banner suscripción
- /agenda → Calendario (semana/mes/día) + disponibilidad + panel de aprobaciones
- /patients → Lista de pacientes
- /consultations → Consultas médicas
- /ehr → Historial clínico electrónico
- /finances → Finanzas del médico (gated por plan_features)
- /billing → Facturación
- /reports → Reportería con filtros de fecha
- /crm → CRM de leads
- /reminders → Recordatorios
- /messages → Mensajes con pacientes
- /invitations → Invitaciones por link único
- /plans → Planes de precios del médico
- /settings → Configuración del médico (perfil, booking, pagos)

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
- leads, payments, reminders_settings, reminders_queue, subscription_payments, doctor_invitations

### Feature keys disponibles
dashboard, agenda, patients, consultations, ehr, finances, billing, reports, crm, reminders, messages, invitations, settings

## Modelo de suscripciones (4 planes)
- **Trial**: $0, 15 días gratis, se suspende al vencer
- **Basic**: $10 USD/mes
- **Professional**: $30 USD/mes
- **Clinic**: $100 USD/mes, incluye gestión de médicos

### Flujo de suscripción
1. Médico se registra → subscription status='trial', 15 días
2. Al vencer → status='suspended', vista bloqueante
3. Médico sube comprobante de pago → admin verifica → status='active', 30 días más
4. Banners: amarillo <7 días, rojo <3 días
5. Admin puede activar/desactivar planes desde /admin/plans
6. Admin configura features por plan desde /admin/plan-features

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
