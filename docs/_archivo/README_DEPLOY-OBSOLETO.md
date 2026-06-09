# MedSaaS Venezuela — Guía de Despliegue

## Descripción General

**MedSaaS Venezuela** es una plataforma SaaS médica omnicanal para especialistas en Venezuela, construida con:
- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS
- **Backend:** Supabase (Auth, DB, Storage)
- **UI:** Shadcn/ui + Lucide React
- **Hosting:** Vercel

---

## 1. Requisitos Previos

- Node.js 18+ y npm/yarn
- Cuenta activa en [Supabase](https://supabase.com)
- Cuenta en [Vercel](https://vercel.com)
- Git instalado

---

## 2. Configuración Local

### 2.1 Clonar repositorio

```bash
git clone <tu-repo>
cd medsaas-venezuela
npm install
```

### 2.2 Crear archivo `.env.local`

En la raíz del proyecto, crear:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://azsismbgfanszkygzwaz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui

# Opcional: Integraciones
GOOGLE_CLIENT_ID=tu_google_client_id
GOOGLE_CLIENT_SECRET=tu_google_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=genera_uno_aqui
```

### 2.3 Ejecutar migraciones SQL en Supabase

1. Ve a [Supabase Console](https://app.supabase.com)
2. Abre tu proyecto
3. Ve a **SQL Editor** → **New Query**
4. Copia y ejecuta cada uno de estos archivos SQL **en orden**:

```
1. sql_migrations.sql
2. sql_appointments_and_testdata.sql
3. sql_billing_documents.sql
4. sql_seed_ehr.sql
5. sql_seed_data_v2_fixed.sql
```

### 2.4 Ejecutar servidor dev

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

---

## 3. Usuarios de Prueba

Después de ejecutar los SQL seeds, tendrás:

### Médico
- **Email:** El primer email registrado en `profiles`
- **Contraseña:** La que configuraste en el seed o al registrarte
- **Acceso:** `http://localhost:3000/doctor`

### Super Administrador
- **Email:** jesussolano4@gmail.com
- **Acceso:** `http://localhost:3000/admin`

---

## 4. Estructura de Carpetas

```
medsaas-venezuela/
├── app/
│   ├── admin/              # Panel super-admin
│   ├── doctor/             # App del médico (CRM, agenda, facturación)
│   ├── patient/            # Portal del paciente
│   ├── book/               # Sistema de booking público
│   ├── api/                # API routes (Supabase edge functions)
│   └── auth/               # Login, registro
├── lib/
│   ├── supabase/          # Clientes Supabase
│   └── utils/             # Utilidades compartidas
├── components/            # Componentes reutilizables
├── sql_*.sql              # Migraciones y seeds
└── README_DEPLOY.md       # Este archivo
```

---

## 5. Despliegue en Vercel

### 5.1 Conectar repositorio

1. Ve a [Vercel](https://vercel.com)
2. **New Project** → Importa tu repo de GitHub
3. **Framework:** selecciona `Next.js`

### 5.2 Configurar variables de entorno

En **Settings → Environment Variables**, agrega:

```
NEXT_PUBLIC_SUPABASE_URL=https://azsismbgfanszkygzwaz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<tu_service_role_key>
```

### 5.3 Deploy

```bash
git push origin main
```

Vercel desplegará automáticamente. ✅

---

## 6. Funcionalidades Implementadas

### Admin
- Dashboard con KPIs en tiempo real
- Gestión de médicos (crear, activar, suspender)
- Verificación de pagos de suscripción
- Panel de recordatorios
- Configuración del sistema

### Médico
- ✅ **Perfil + Avatar Upload** (con auto-crear bucket)
- ✅ **Pacientes** (CRUD, filtrar por cedula)
- ✅ **Agenda** (calendario, reagendar citas con modal datetime)
- ✅ **Historial Clínico (EHR)** con seed de 3 pacientes + 9 consultas + recetas
- ✅ **CRM Leads** (kanban drag-drop, leads manuales en "Cold Leads")
- ✅ **Consultas** (crear, editar, estados)
- ✅ **Planes** (multi-sesiones: si un plan tiene 2+ sesiones, la siguiente se agenda sin re-pago)
- ✅ **Facturación** (recibos, presupuestos con KPI cards, botones responsive)
- ✅ **Reportería** (exportar a CSV con filtros por fecha)
- ✅ **Integraciones** (placeholders para Google Calendar + WhatsApp Business)
- ✅ **Método de pago** (configurar opciones disponibles)
- ✅ **Seguros** (agregar seguros aceptados con plazo de crédito)

### Paciente
- ✅ **Landing personalizado** (`/patient/[patientId]`)
- ✅ **Próximas citas**
- ✅ **Historial de consultas**
- ✅ **Descargar reportes (PDF imprimible)**

### Booking Público
- ✅ **Página de reserva** (`/book/[doctorId]`)
- ✅ **Seleccionar plan**
- ✅ **Registrar datos paciente**
- ✅ **Confirmar cita**
- ✅ **Planes múltiples:** Si el paciente ya tiene una cita con sesiones restantes, salta pago

### Especialidades
- ✅ Agregada "Psicología" a la lista (settings, registro, admin)

---

## 7. Testing de Funcionalidades

### Test: Upload de Avatar
1. Login como médico
2. Ve a **Configuración → Mi perfil**
3. Click en **Cambiar foto**
4. Sube una imagen
5. Si falla por bucket inexistente, el sistema intenta crearla automáticamente

### Test: Crear Lead Manual (CRM)
1. Ve a **CRM Leads**
2. Click en **+ Lead manual**
3. Completa nombre, teléfono, canal
4. Submit
5. **Debería aparecer en columna "Cold Leads" inmediatamente**

### Test: Reagendar Cita
1. Ve a **Agenda**
2. En panel de aprobaciones, haz click en **Reagendar**
3. Selecciona nueva fecha/hora
4. Confirma → toast "Nueva hora enviada..."

### Test: Exportar Reportería
1. Ve a **Reportería**
2. (Opcional) selecciona rango de fechas
3. Click en **Exportar a CSV**
4. Se descarga archivo con consultas

### Test: Planes Múltiples
1. Como doctor, crea un plan con 3 sesiones
2. Un paciente agenda la primera sesión
3. Para la segunda sesión, el sistema debería:
   - Reconocer que ya tiene sesiones pendientes
   - Saltar el step de pago
   - Crear cita directamente

---

## 8. Estructura de Base de Datos

### Tablas Principales

| Tabla | Propósito |
|-------|-----------|
| `profiles` | Datos médicos + integrations (whatsapp_token, google_refresh_token) |
| `patients` | Pacientes del médico |
| `consultations` | Consultas realizadas |
| `appointments` | Citas agendadas |
| `prescriptions` | Recetas médicas |
| `leads` | Leads de CRM (stage: cold/hot/customer) |
| `plans` | Planes de consulta (precio, duración, sessions_count) |
| `billing_documents` | Facturas, recibos, presupuestos |
| `doctor_insurances` | Seguros aceptados por médico |

### Columnas Agregadas Recientes

```sql
ALTER TABLE appointments ADD COLUMN plan_sessions_remaining INTEGER DEFAULT 1;
ALTER TABLE profiles ADD COLUMN whatsapp_token TEXT;
ALTER TABLE profiles ADD COLUMN whatsapp_phone_id TEXT;
ALTER TABLE profiles ADD COLUMN google_refresh_token TEXT;
```

---

## 9. API Routes

| Ruta | Propósito |
|------|-----------|
| `/api/integrations/google/auth` | Redirige a Google OAuth (stub) |
| `/api/integrations/google/callback` | Callback de Google OAuth (TODO) |

---

## 10. Troubleshooting

### Error: "Bucket avatars not found"
- En Supabase Storage, crea bucket `avatars` como público
- O el sistema lo intenta crear automáticamente en `uploadPhoto()`

### Error: "Table does not exist"
- Ejecuta todos los SQL seeds en orden
- Verifica que no haya errores en console

### Error: "CORS issues"
- En Supabase, ve a **Auth → Providers → Email**
- Agrega tu dominio en la lista de URLs autorizadas
- Para desarrollo local: `http://localhost:3000`

### Error: "NextAuth not configured"
- Si usas integraciones OAuth, configura NextAuth:
  - Instala: `npm install next-auth`
  - Crea `app/api/auth/[...nextauth].ts`
  - Define providers (Google, etc.)

---

## 11. Próximos Pasos (TODO)

- [ ] Implementar edge functions para recordatorios automáticos
- [ ] Cron job para `check_expired_subscriptions()`
- [ ] Integración real con Google Calendar API
- [ ] Integración real con WhatsApp Business API
- [ ] Sistema de pagos (Stripe / Paypal)
- [ ] IA para análisis de consultas
- [ ] App móvil (React Native)
- [ ] Traducción a EN/PT

---

## 12. Soporte

- **Documentación Supabase:** https://supabase.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **Tailwind CSS:** https://tailwindcss.com/docs
- **GitHub Issues:** Abre una issue en el repo

---

## Licencia

Todos los derechos reservados © 2026 MedSaaS Venezuela
