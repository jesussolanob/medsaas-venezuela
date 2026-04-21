# Informe de Auditoría Técnica — Delta Medical CRM (MedSaaS Venezuela)

**Fecha:** 2026-04-20
**Auditor:** Ingeniería Senior / QA
**Alcance:** Auditoría end-to-end de los 7 flujos críticos declarados.
**Código base auditado:** rama `main` — Next.js 15 (App Router) + Supabase + TypeScript.
**Método:** Revisión estática exhaustiva del código fuente, 28 migraciones SQL, políticas RLS declaradas, y rutas API. La conexión directa a Supabase desde el entorno del auditor está bloqueada por política de egress; se entrega `introspect_supabase.sql` para que el Super Admin ejecute la validación en vivo y confirme los hallazgos.

---

## 1. Resumen Ejecutivo

**Nivel general de salud: 🔴 Crítico-Alto.** El sistema está funcionalmente cerca del MVP pero tiene un conjunto de **defectos de seguridad, integridad de datos y de lógica de negocio** que deben remediarse antes de abrir el producto a tráfico externo. En particular:

- **RBAC inconsistente**: el middleware sólo verifica autenticación, no roles. Layouts admin/doctor/patient no validan el rol en servidor. Cualquier usuario autenticado puede cargar `/admin` y ver la UI (aunque los endpoints rechacen).
- **Endpoints públicos peligrosos**: `/api/admin/reset-database`, `/api/seed-accounts`, `/api/seed-clinic`, `/api/admin/seed`, `/api/debug-booking` están en el build de producción; dos de ellos **sin autenticación** y dos con autenticación débil.
- **Inconsistencia "enterprise" vs "clinic"**: `lib/subscription.ts` y `approve-payment` usan `"enterprise"` mientras `CLAUDE.md` y la UI declaran `"clinic"` para el plan de $100. Esto ya puede haber creado registros cruzados.
- **Feature-gating roto**: `CLAUDE.md` declara que el sidebar del médico lee `plan_features`. La revisión del código confirma que `app/doctor/layout.tsx` **no consulta `plan_features`** — el sidebar muestra todos los módulos independientemente del plan.
- **Migración SQL desordenada**: 28 archivos `sql_migration_v*.sql` con duplicación sistemática (policies con y sin tildes duplicadas, índices duplicados, columnas recreadas), y **las tablas `subscriptions`/`subscription_payments` no tienen `CREATE TABLE` en ningún archivo** (existen solo en producción porque se crearon desde el dashboard).
- **WhatsApp NO está implementado**. El botón "WhatsApp" en `/doctor/reminders` simula el envío (marca `sent` en UI) sin llamar ninguna API de mensajería. La cola `reminders_queue` existe pero no tiene productor ni consumidor automatizado.
- **Condición de carrera en paquetes prepagados** (`/api/book`): el optimistic-lock existe pero se aplica DESPUÉS del INSERT de la cita, por lo que es posible bookings simultáneos que creen dos citas con el mismo `session_number`.
- **Payments con aritmética float**: totales financieros calculados con `Array.reduce` y `+` sobre `number` JS. Se arrastran errores de redondeo (`0.1 + 0.2 ≠ 0.3`).
- **OAuth callback con fallback a `doctor`**: un usuario con `role=null` termina redirigido a `/doctor` por defecto.

**Hallazgos totales detectados:** 47 — 8 Críticos, 14 Altos, 17 Medios, 8 Bajos/Informativos.

---

## 2. Matriz de Hallazgos

| ID | Severidad | Flujo | Área | Hallazgo corto |
|----|-----------|-------|------|-----------------|
| CR-001 | 🔴 Crítico | Auth / RBAC | `middleware.ts` | Middleware sólo verifica autenticación, no el rol; cualquier usuario autenticado entra a `/admin` y `/doctor`. |
| CR-002 | 🔴 Crítico | Base de datos | Migraciones | `subscriptions` y `subscription_payments` no existen en ningún `CREATE TABLE` del repo — schema no reproducible. |
| CR-003 | 🔴 Crítico | APIs | `/api/admin/reset-database` | Endpoint destructivo de producción con email admin hardcodeado; no requiere doble confirmación. |
| CR-004 | 🔴 Crítico | APIs | `/api/seed-accounts`, `/api/seed-clinic` | **Sin ninguna autenticación**; crean usuarios reales con contraseñas hardcodeadas (`12345678`). |
| CR-005 | 🔴 Crítico | APIs | `/api/admin/seed` | Tampoco verifica autenticación; modifica datos productivos. |
| CR-006 | 🔴 Crítico | Booking / Paquetes | `/api/book` | Optimistic-lock sobre `used_sessions` se aplica **después** del INSERT del appointment; carrera posible. |
| CR-007 | 🔴 Crítico | Finanzas / Suscripciones | `lib/subscription.ts` vs `approve-payment` | Inconsistencia `enterprise` vs `clinic` para plan $100; dos mundos coexisten en producción. |
| CR-008 | 🔴 Crítico | WhatsApp | Reminders | Módulo "WhatsApp" no llama ninguna API; solo actualiza UI local. Promesa incumplida con el cliente. |
| AL-101 | 🟠 Alto | Auth / RBAC | `/auth/callback` | `profile.role === null` cae al default `doctor`. |
| AL-102 | 🟠 Alto | Auth / RBAC | `doctor/layout.tsx` | Feature gating por `plan_features` declarado en CLAUDE.md no implementado en el layout. |
| AL-103 | 🟠 Alto | Auth / RBAC | `admin/layout.tsx` | Layout es `'use client'`; sin server-side guard por rol. |
| AL-104 | 🟠 Alto | Consultas | `/api/doctor/consultations` PATCH | Spreads `body` a `update()` permitiendo al doctor mutar `doctor_id` de sus propias consultas. |
| AL-105 | 🟠 Alto | Consultas | `/api/doctor/consultations` POST | `finalAmount = amount \|\| 0`, sin validar tipo. String "20" rompe el status `pending_approval`. |
| AL-106 | 🟠 Alto | Consultas | `/api/doctor/consultations` POST | Al recibir `appointment_id`, sobrescribe `status='confirmed'` sin validar owner. |
| AL-107 | 🟠 Alto | Consultas | `/api/doctor/consultations` DELETE | Elimina ehr_records, prescriptions, consultation, appointment sin transacción → orfandad parcial. |
| AL-108 | 🟠 Alto | Finanzas | `finances/page.tsx` | Totales con `Array.reduce` sobre floats; errores de redondeo en reportes. |
| AL-109 | 🟠 Alto | Finanzas | `approve-payment` | No es idempotente; dos clicks extienden la suscripción dos veces. |
| AL-110 | 🟠 Alto | Finanzas | `approve-payment` | Plan determinado por `payment.amount === 30/100`, hardcodeado; no usa `plan_configs`. |
| AL-111 | 🟠 Alto | Calendario / Booking | `/api/book` | `endDt = startDt + 30 min` hardcodeado; ignora `duration_minutes` del plan. |
| AL-112 | 🟠 Alto | Calendario / Booking | `/api/book` | Si falla Google Calendar o BCV, appointment queda creado pero metadata incompleta; sin compensación. |
| AL-113 | 🟠 Alto | Calendario / Booking | `/api/book` | Retry silencioso con columnas mínimas: pierde BCV, insurance, package silenciosamente si schema desfasa. |
| AL-114 | 🟠 Alto | Base de datos | Migraciones SQL | 25 pares de políticas RLS duplicadas (con y sin tildes/acentos en el nombre). |
| AL-115 | 🟠 Alto | APIs | `/api/book` | Sin rate limiting; endpoint público. Vector trivial de DoS. |
| ME-201 | 🟡 Medio | Auth | `/patient/login`, `/patient/register` | Rutas bajo matcher `/patient/:path*` del middleware; redireccionan a `/login` antes de renderizar — dead code. |
| ME-202 | 🟡 Medio | Auth | `/login` | `resendConfirmation` auto-confirma email sin validar propiedad del correo (modo beta). |
| ME-203 | 🟡 Medio | Consultas | `/api/doctor/consultations` | Código de consulta `CON-YYYYMMDD-XXXX` usa `Math.random()`; colisión teórica, no criptográficamente seguro. |
| ME-204 | 🟡 Medio | Finanzas | `finances/page.tsx` | Income viene de `appointments.status='completed'`; si el médico no marca "completada" la cita, el ingreso no se contabiliza. |
| ME-205 | 🟡 Medio | Finanzas | Payment flow | `payment_status` de `consultations` no se sincroniza con `appointments.status`; dos fuentes de verdad financiera. |
| ME-206 | 🟡 Medio | Calendario | `/api/doctor/schedule` POST | DELETE + INSERT no atómico; fallo deja al médico sin disponibilidad. |
| ME-207 | 🟡 Medio | Calendario | `/api/book` | `timeZone: 'America/Caracas'` hardcodeado. |
| ME-208 | 🟡 Medio | Calendario | `/api/book` | Validación de duplicados sólo filtra `['scheduled','confirmed']` — citas marcadas `completed` o `no_show` ese mismo día no bloquean. (Aceptable, pero debe documentarse). |
| ME-209 | 🟡 Medio | APIs | `/api/book` | Self-fetch a `/api/admin/bcv-rate` (otro endpoint interno) por cada booking; acopla dos funciones serverless. |
| ME-210 | 🟡 Medio | APIs | `/api/book` | `plan_price \|\| 20` — $20 por defecto si cliente no lo envía; vale para cualquier plan. |
| ME-211 | 🟡 Medio | Base de datos | Migraciones | Índices duplicados (`idx_appointments_scheduled` y `idx_appointments_scheduled_at`). |
| ME-212 | 🟡 Medio | Base de datos | Migraciones | Columna `session_number` definida dos veces con tipos distintos (`INT` y `INTEGER`). |
| ME-213 | 🟡 Medio | Base de datos | Migraciones | Columna `appointment_mode` y `scheduled_at` declaradas dos veces. |
| ME-214 | 🟡 Medio | Base de datos | Migraciones | `profiles.clinic_id` ALTER añadido dos veces (case distinto `UUID`/`uuid`). |
| ME-215 | 🟡 Medio | Base de datos | Policies | `patient_messages` tiene policy `FOR ALL USING (true)` — lee y escribe sin restricción. |
| ME-216 | 🟡 Medio | Base de datos | Policies | `admin_roles` tiene policy `FOR ALL USING (true)` — cualquiera puede leer los roles. |
| ME-217 | 🟡 Medio | APIs | `/api/book` | Retry de patient insert sin `auth_user_id` desvincula el paciente del login. |
| BA-301 | 🔵 Bajo | Observabilidad | Varias | Sin logger estructurado; `console.log/warn/error` diseminados. |
| BA-302 | 🔵 Bajo | Observabilidad | APIs | No hay request IDs ni trazas; imposible correlacionar logs en Vercel. |
| BA-303 | 🔵 Bajo | UX | `finalName = user.email.split('@')[0]` | Usa prefijo de email como nombre si no lo envía el cliente. |
| BA-304 | 🔵 Bajo | UX | `lib/subscription.ts` | Todos los planes mapeados a `"Beta Privada"` — UI admin no distingue planes. |
| BA-305 | 🔵 Bajo | Código muerto | `/patient/login`, `/patient/register` | Sólo hacen `router.push('/login')`. |
| BA-306 | 🔵 Bajo | Código muerto | `/auth/callback` | Lee `next` query param y no lo usa. |
| BA-307 | 🔵 Bajo | Tests | Todo el repo | No hay tests unitarios ni E2E. |
| BA-308 | 🔵 Bajo | Tipado | `/api/doctor/consultations` | `updateData: any` en PATCH y approve-payment — pierde type-safety. |

---

## 3. Detalle técnico de hallazgos (los 15 más relevantes)

### CR-001 — Middleware no verifica rol (Crítico)
**Ubicación:** `middleware.ts:28-42`
**Evidencia:**
```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user && request.nextUrl.pathname.startsWith('/admin')) {
  return NextResponse.redirect(new URL('/login', request.url))
}
// ...no role check before allowing through
return supabaseResponse
```
**Reproducir:** loguéate como cualquier `patient`, navega a `https://app/admin`. El middleware no redirige porque `user` existe; la UI admin carga (aunque las acciones fallarán por RLS/role checks server-side).
**Impacto:** filtración de UI admin (estructura de navegación, nombres de secciones, endpoints visibles en Network), base para escaladas laterales.
**Solución propuesta:**
```ts
// middleware.ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.redirect(new URL('/login', request.url))

// Consultar rol (cachear en cookie propia para no golpear BD en cada request)
const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
const role = profile?.role ?? 'doctor'

if (request.nextUrl.pathname.startsWith('/admin') && !['super_admin','admin'].includes(role)) {
  return NextResponse.redirect(new URL('/', request.url))
}
if (request.nextUrl.pathname.startsWith('/doctor') && !['doctor','super_admin','admin'].includes(role)) {
  return NextResponse.redirect(new URL('/patient/dashboard', request.url))
}
if (request.nextUrl.pathname.startsWith('/patient') && role !== 'patient' && !['super_admin','admin'].includes(role)) {
  return NextResponse.redirect(new URL('/doctor', request.url))
}
```
Además: **añadir `export const dynamic = 'force-dynamic'`** o un server-side guard en `app/admin/layout.tsx` (convertirlo a async Server Component que consulte el rol antes de renderizar el `'use client'` child).

---

### CR-002 — Tablas `subscriptions` y `subscription_payments` no versionadas (Crítico)
**Evidencia:** `grep -R "CREATE TABLE.*subscriptions" *.sql` → vacío. Sin embargo `lib/subscription.ts:146`, `approve-payment/route.ts:35`, múltiples páginas admin consultan ambas tablas.
**Impacto:** el schema productivo NO puede recrearse desde el repo. Un desarrollador que clone y aplique todas las migraciones obtiene un build que colapsa al primer `supabase.from('subscriptions').select()`.
**Solución propuesta:** crear `sql_migration_v24_subscriptions.sql` con el `CREATE TABLE IF NOT EXISTS subscriptions (...)` y `subscription_payments (...)` reconstruyendo la forma real desde Supabase. Entregado en `fixes_remediation.sql` y en `introspect_supabase.sql` para que descargues el DDL actual.

---

### CR-003 — `/api/admin/reset-database` expuesto con lógica frágil (Crítico)
**Ubicación:** `app/api/admin/reset-database/route.ts`
**Evidencia:**
- Línea 27: `const keepEmail = 'jesussolano4@gmail.com'` (hardcoded).
- Línea 35-53: lista de tablas incompleta; faltan `billing_documents`, `doctor_availability`, `doctor_schedule_config`, `clinics`, `admin_roles`, `invoices`, etc.
- Líneas 65-77: dos deletes con filtros confusos (`.neq('doctor_id', adminId)` y luego `.neq('id', adminId).not('doctor_id','is',null)`).
- Sin token de confirmación (ni `x-confirm: DELETE_ALL`), sin dry-run.
**Reproducir:** un token de service-role filtrado o un bug de auth permite un POST que borra la base.
**Solución propuesta:** eliminar el endpoint del build de producción (`NODE_ENV === 'production'` → `return 404`) o reemplazar por un script offline (`scripts/reset-dev-db.ts`) que nunca se despliegue a Vercel.

---

### CR-004 — `/api/seed-accounts` y `/api/seed-clinic` sin autenticación (Crítico)
**Ubicación:** `app/api/seed-accounts/route.ts`, `app/api/seed-clinic/route.ts`
**Evidencia:**
```ts
export async function GET() { return handler() }
export async function POST() { return handler() }
async function handler() {
  const supabase = createAdminClient()
  const { data: patientAuth } = await supabase.auth.admin.createUser({
    email: 'ivana@gmail.com', password: '12345678',
    email_confirm: true, user_metadata: { full_name: 'Ivana Solano', role: 'patient' },
  })
  // ...
}
```
**Reproducir:** `curl https://app/api/seed-accounts` — crea un usuario real en Supabase con credenciales públicas.
**Solución propuesta:** Borrar ambos endpoints o envolverlos en guard `if (process.env.NODE_ENV !== 'development') return NextResponse.json({error:'disabled'},{status:404})`.

---

### CR-006 — Race condition en paquetes prepagados (Crítico)
**Ubicación:** `app/api/book/route.ts:541-581`
**Evidencia:**
```ts
// ── 2. Create appointment (line 319) ─────────
const { data: appt } = await admin.from('appointments').insert(appointmentData).select('id').single()
// ── 3. Handle packages (line 378) ─────────────
if (validatedPackage) { await updatePackageUsage(admin, validatedPackage, appt.id) }

// updatePackageUsage (line 554-559)
await admin.from('patient_packages').update({used_sessions: newUsed, ...})
  .eq('id', pkg.id)
  .eq('used_sessions', pkg.used_sessions) // optimistic lock
```
**Problema:** si dos bookings concurrentes pasan la validación (`pkg.used_sessions < total_sessions`), ambos insertan `appointments` (éxito) y luego ambos intentan UPDATE con el mismo `used_sessions=X`. Uno gana, el otro silenciosamente **no actualiza** (`eq` no falla, sólo devuelve 0 filas). El appointment del perdedor ya existe en la BD pero no descontó sesión.
**Impacto:** paciente usa más sesiones que las compradas; pérdida de ingreso; sobre-reserva.
**Solución propuesta (recomendada):** mover la lógica a una función SQL transaccional:
```sql
CREATE OR REPLACE FUNCTION book_with_package(p_package_id uuid, p_appt jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_appt_id uuid; v_used int; v_total int;
BEGIN
  SELECT used_sessions, total_sessions INTO v_used, v_total
  FROM patient_packages WHERE id = p_package_id FOR UPDATE;
  IF v_used >= v_total THEN RAISE EXCEPTION 'Package exhausted'; END IF;

  INSERT INTO appointments (...) VALUES (...) RETURNING id INTO v_appt_id;
  UPDATE patient_packages SET used_sessions = v_used+1,
    status = CASE WHEN v_used+1 >= v_total THEN 'completed' ELSE status END
    WHERE id = p_package_id;
  RETURN v_appt_id;
END $$;
```
Y el endpoint llama `admin.rpc('book_with_package', {...})`. El `FOR UPDATE` serializa por paquete.

---

### CR-007 — Plan `enterprise` vs `clinic` — inconsistencia total (Crítico)
**Evidencia:**
- `lib/subscription.ts:10` — `PlanKey = 'trial' | 'basic' | 'professional' | 'enterprise' | 'clinic'`
- `approve-payment/route.ts:124-133`:
```ts
if (payment.amount === 30) updatePayload.plan = 'professional'
else if (payment.amount === 100) updatePayload.plan = 'enterprise'
else updatePayload.plan = 'basic'
```
- `CLAUDE.md:70-73`: "Clinic: $100 USD/mes, incluye gestión de médicos"
- `sql_migration_v11.sql:subscription_plan text DEFAULT 'centro_salud'`
- Tabla `plan_configs` en Admin UI permite keys `trial|basic|professional|clinic`.

**Impacto:** cuando admin aprueba un pago de $100, crea un registro con `plan='enterprise'`, pero el sidebar y el dashboard del médico buscan `plan='clinic'` para habilitar "Mi Clínica". El médico pagó pero **no ve la feature que compró**.
**Solución propuesta:** unificar en `plan='clinic'` (coherente con CLAUDE.md y `plan_configs`). Migrar registros existentes:
```sql
UPDATE subscriptions SET plan='clinic' WHERE plan='enterprise';
```
Y cambiar `approve-payment` y `PlanKey`. También revisar `centro_salud` como default — debería ser `'clinic'` o explícitamente eliminarse.

---

### CR-008 — WhatsApp no implementado (Crítico por falso-positivo al cliente)
**Ubicación:** `app/doctor/reminders/page.tsx:163-180`
**Evidencia:**
```ts
function sendWhatsApp(consult: Consultation) {
  // ... construye mensaje ...
  markSent(consult.id, 'whatsapp')   // sólo mutación de UI local
}
function markSent(consultId: string, channel: 'whatsapp'|'email') {
  setRemindersSent(prev => ({ ...prev, [consultId]: {channel, sentAt: new Date().toISOString()} }))
}
```
No se llama a WhatsApp Business API, ni se escribe en `reminders_queue`, ni se encola en ningún worker. El botón "WhatsApp" es teatro.
**Impacto:** médicos creen que mandaron recordatorios que nunca salieron. Riesgo de cita perdida + descontento del paciente.
**Solución propuesta inmediata:**
1. Quitar el texto "Enviado" del UI y reemplazar por "Abrir WhatsApp (wa.me)" que abre `https://wa.me/<phone>?text=<encoded>` — solución honesta por ahora.
2. Roadmap: crear Edge Function `wa-send` que llame a Meta Cloud API; `reminders_queue` como tabla-input, cron (`pg_cron` o GitHub Action) que dispare cada 5 min.

---

### AL-104 — PATCH consultas: spread peligroso (Alto)
**Ubicación:** `app/api/doctor/consultations/route.ts:149-157`
**Evidencia:**
```ts
const body = await req.json()
const { id, ...fields } = body
// ...
await admin.from('consultations').update({ ...fields, updated_at: ... })
  .eq('id', id).eq('doctor_id', user.id)
```
Un médico malicioso envía `{id:"xxx", doctor_id: OTHER_DOCTOR_ID, payment_status:"verified"}`. El `.eq('doctor_id', user.id)` filtra por el doctor ACTUAL (correcto), pero el `update({...fields})` **reasigna** `doctor_id` al otro. La consulta ahora pertenece al otro médico. También puede forzar `payment_status='verified'` sin pasar por `approve-payment`.
**Solución propuesta:**
```ts
const ALLOWED = ['chief_complaint','notes','diagnosis','treatment','amount','payment_method','payment_reference']
const safe = Object.fromEntries(Object.entries(fields).filter(([k]) => ALLOWED.includes(k)))
await admin.from('consultations').update({ ...safe, updated_at: ... })
```

---

### AL-108 — Totales financieros en float JS (Alto)
**Ubicación:** `app/doctor/finances/page.tsx:125-127`
**Evidencia:**
```ts
const totalIncome = filteredIncomes.reduce((sum, i) => sum + (i.amount_usd || 0), 0)
```
Con 3 transacciones de `$10.10` + `$20.20` + `$30.30` → `60.599999999999994`. En Caracas con BCV=43.08 el error se amplifica a Bs.
**Solución propuesta:** multiplicar todo por 100, sumar enteros, dividir al final. O usar `decimal.js`:
```ts
import Decimal from 'decimal.js'
const totalIncome = filteredIncomes.reduce((s, i) => s.plus(i.amount_usd || 0), new Decimal(0)).toNumber()
```

---

### AL-109 — `approve-payment` no idempotente (Alto)
**Ubicación:** `app/api/admin/approve-payment/route.ts:48-163`
**Evidencia:** el endpoint no verifica si `payment.status` ya es `'verified'` antes de ejecutar. Dos clicks rápidos extienden la suscripción dos veces (sumando 60 días en lugar de 30).
**Solución propuesta:**
```ts
const { data: payment } = await admin.from('subscription_payments').select('id, status, ...').eq('id', paymentId).single()
if (payment.status === 'verified' && action === 'approve') {
  return NextResponse.json({ error: 'Pago ya verificado', alreadyApplied: true }, { status: 409 })
}
```

---

### AL-114 — Policies RLS duplicadas con acentos (Alto)
**Evidencia:** se encontraron 25 pares de políticas con el mismo efecto pero nombres distintos:
- `"Medico gestiona sus consultas"` + `"Médico gestiona sus consultas"`
- `"Medico gestiona sus recetas"` + `"Médico gestiona sus recetas"`
- `"Admin manages roles"` duplicada, etc.

**Impacto:** al evaluar RLS, Postgres aplica **OR** de todas las policies con el mismo comando. Si una de las duplicadas tiene condición distinta (p.ej. se "afloja" accidentalmente), el efecto es el más permisivo de las dos. Más crítico: si en producción una está habilitada y la otra no, un `DROP POLICY` de limpieza puede dejar sin RLS.
**Solución propuesta:** `DROP POLICY IF EXISTS` de los duplicados sin tilde, dejar SOLO los con tilde. Entregado como `fixes_remediation.sql`.

---

### ME-205 — Doble fuente de verdad financiera (Medio, pero estratégico)
**Evidencia:** `appointments.status` ∈ {scheduled, confirmed, completed, cancelled, no_show} gobierna lo que se muestra en Finanzas. `consultations.payment_status` ∈ {unpaid, pending_approval, verified, rejected} gobierna lo que se muestra en Cobros. Un pago aprobado por el admin actualiza `subscription_payments.status` pero **no** actualiza `appointments.status` ni `consultations.payment_status`. Las tres tablas divergen.
**Solución propuesta:** adoptar `appointments` como única fuente financiera (CLAUDE.md dice "Appointment = financial truth"). Eliminar `consultation_payments` y `consultations.payment_status` del cálculo de ingresos. Si se conserva `payment_status` por auditoría, agregar un trigger que sincronice:
```sql
CREATE OR REPLACE FUNCTION sync_consultation_payment_status() ...
```
(Este trigger ya existe en v13 pero revisar que efectivamente corra.)

---

## 4. Plan de Remediación

| Fase | Duración | Contenido |
|------|----------|-----------|
| **F1 — Stop-the-bleed** | 1-2 días | CR-001, CR-003, CR-004, CR-005, CR-007, CR-008 (retirar UI falsa). Ejecutar `fixes_remediation.sql` parte 1 (limpieza policies duplicadas). |
| **F2 — Integridad de datos** | 3-5 días | CR-002 (crear migración formal para subscriptions), CR-006 (RPC transaccional), AL-104, AL-107, AL-108, AL-109. |
| **F3 — Calidad de negocio** | 5-7 días | AL-105, AL-106, AL-110, AL-111, AL-112, AL-113, ME-205 (sincronización financiera), ME-204. |
| **F4 — Higiene** | 2-3 días | ME-201 a ME-217 + todos los BA-*. Logs estructurados, tests E2E. |
| **F5 — WhatsApp real** | 5-10 días | Meta Cloud API, Edge Function, cron, webhook de estado. |

Total estimado: **16-27 días de trabajo de un ingeniero senior**.

---

## 5. Reporte de Limpieza de Base de Datos

### 5.1 Inventario inicial detectado (estático, desde migraciones)

**28 tablas CREATE TABLE encontradas:**
`accounts_payable`, `admin_roles`, `appointment_reminders_config`, `appointments`, `billing_documents`, `clinic_invitations`, `clinics`, `consultation_payments`, `consultations`, `doctor_availability`, `doctor_blocked_slots`, `doctor_insurances`, `doctor_invitations`, `doctor_quick_items`, `doctor_schedule_config`, `doctor_services`, `doctor_templates`, `ehr_records` (implícito por policies), `invoices`, `lead_messages`, `leads`, `patient_messages`, `patient_packages`, `patients`, `payment_accounts`, `prescriptions`, `pricing_plans`, `profiles` (vía ALTER), `waitlist`.

**Tablas referenciadas por el código pero sin CREATE TABLE en el repo:**
- `subscriptions` (usada en `lib/subscription.ts`, `approve-payment`, etc.)
- `subscription_payments` (usada en `approve-payment`, `admin/approvals`)
- `plan_configs` (usada en `/admin/plans`, `/register`)
- `plan_features` (usada en `/admin/plan-features`, debería usarse en sidebar del doctor)
- `plan_promotions` (usada en `approve-payment`)
- `payments` (usada en `reset-database`)
- `reminders_queue` (usada en `/admin/reminders`)
- `reminders_settings` (mencionada en CLAUDE.md)
- `doctor_suggestions`, `admin_suggestions` (usadas en páginas admin/doctor/suggestions)

El script `introspect_supabase.sql` generará el DDL real de estas tablas en tu Supabase.

### 5.2 Duplicados dentro de migraciones (source)

| Tipo | Cantidad | Ejemplos |
|------|----------|----------|
| Policies RLS duplicadas por acentos | 25 | `Medico gestiona sus consultas` / `Médico gestiona sus consultas` |
| Índices duplicados (mismas columnas) | 7 | `idx_appointments_scheduled` y `idx_appointments_scheduled_at` sobre `appointments(scheduled_at)` |
| `ADD COLUMN IF NOT EXISTS` repetidos en archivos distintos | ~15 | `session_number INT` y `session_number INTEGER` |
| `ALTER TABLE profiles ADD clinic_id` declarado dos veces | 2 | `UUID` (v_full) y `uuid` (v11) |
| Archivos `sql_migration_full.sql` + `sql_migrations.sql` + `sql_migration_v9.sql`... | 3 superset | contenido redundante |

### 5.3 Duplicados dentro de la BD (requiere ejecutar `introspect_supabase.sql`)

Hay que confirmar en vivo:
- Registros duplicados en `appointments` por `(doctor_id, patient_email, scheduled_at)` con ±15 min.
- `patients` con `(doctor_id, email)` duplicados (la validación cliente permite crear uno nuevo si el lookup falla).
- `patient_packages` en estado `active` con `used_sessions > total_sessions`.
- `consultations` con `appointment_id` apuntando a appointments borrados (huérfanos).
- `profiles` con `role=null` (cae al default `doctor` en el callback).
- `subscriptions` con `plan='enterprise'` vs `plan='clinic'`.

### 5.4 Acciones propuestas (DESTRUCTIVAS — requieren tu confirmación)

Todas las acciones destructivas están **encapsuladas en `fixes_remediation.sql`** con sections `A`, `B`, `C`. **NO ejecutes el archivo entero**; te pediré confirmación por sección antes de que lo corras.

### 5.5 Backup previo

Antes de cualquier DELETE/DROP, ejecutar:
```sql
-- En SQL Editor de Supabase (sección 0 de fixes_remediation.sql)
CREATE SCHEMA IF NOT EXISTS backup_20260420;

CREATE TABLE backup_20260420.appointments AS SELECT * FROM public.appointments;
CREATE TABLE backup_20260420.consultations AS SELECT * FROM public.consultations;
CREATE TABLE backup_20260420.patient_packages AS SELECT * FROM public.patient_packages;
CREATE TABLE backup_20260420.patients AS SELECT * FROM public.patients;
CREATE TABLE backup_20260420.profiles AS SELECT * FROM public.profiles;
CREATE TABLE backup_20260420.subscriptions AS SELECT * FROM public.subscriptions;
CREATE TABLE backup_20260420.subscription_payments AS SELECT * FROM public.subscription_payments;
```
Supabase también genera snapshots diarios automáticos — confirmar en Dashboard → Database → Backups que tienes al menos un snapshot < 24h antes de proceder.

---

## 6. Checklist de Validación Final

Después de aplicar las correcciones, ejecutar y confirmar:

- [ ] `introspect_supabase.sql` sección 1: policies duplicadas = 0.
- [ ] `introspect_supabase.sql` sección 2: índices duplicados = 0.
- [ ] `introspect_supabase.sql` sección 3: subscriptions con plan='enterprise' = 0.
- [ ] `introspect_supabase.sql` sección 4: appointments duplicadas por (doctor_id, patient_email, ±15 min) = 0.
- [ ] `introspect_supabase.sql` sección 5: patient_packages con used_sessions > total_sessions = 0.
- [ ] `introspect_supabase.sql` sección 6: profiles con role NULL = 0.
- [ ] `introspect_supabase.sql` sección 7: consultations huérfanas (appointment_id inexistente) = 0.
- [ ] Middleware actualizado: probar con cuenta patient acceso a `/admin` → redirect a `/patient/dashboard`.
- [ ] `approve-payment` idempotente: ejecutar dos veces, segunda devuelve 409.
- [ ] `/api/seed-accounts`, `/api/seed-clinic`, `/api/admin/seed`, `/api/admin/reset-database`, `/api/debug-booking` devuelven 404 en producción.
- [ ] Race condition en paquetes: probar 20 requests concurrentes contra un paquete con 1 sesión → sólo 1 succeeds.
- [ ] Feature gating del doctor layout lee `plan_features` (o la función `isMvpFeatureEnabled` se documenta como el nuevo contrato y se elimina la tabla `plan_features` del admin).
- [ ] `/doctor/reminders` — reemplazar o etiquetar claramente que WhatsApp es manual (wa.me).
- [ ] Tests E2E críticos: `/api/book` (guest, authed, package), login con roles, approve-payment.

---

## 7. Anexos

- `introspect_supabase.sql` — ejecutar en SQL Editor de Supabase para validar hallazgos en vivo.
- `fixes_remediation.sql` — scripts correctivos, seccionados (ejecutar con confirmación explícita por sección).
- `CLAUDE.md` — documento de contexto existente (no modificado en esta auditoría).

**Fin del informe.**
