# Plan de Diseño — Actualizaciones Fase 2

**Fecha:** 2026-04-21
**Estado:** Pendiente de aprobación antes de ejecutar.
**Base:** MVP estable con 49/49 tests E2E pasando (rama `main`).

---

## 🔑 Resumen ejecutivo

| # | Actualización | Días estimados | Dependencias |
|---|---|---|---|
| 1 | Paquetes de consultas (saldo + log auditable + admin CRUD) | 4–5 | Ninguna; independiente |
| 2 | Plantillas multi-especialidad (catálogo + config por doctor) | 4–5 | Ninguna; independiente |
| 3 | Agenda tipo Google Calendar (grilla completa + drag/drop + log inmutable) | 6–8 | Necesita #1 para validar saldo al click en slot |
| 4 | Formulario unificado `NewAppointmentFlow` con inline patient creator | 3–4 | Necesita #1 (paquetes), #3 (slots en tiempo real) |
| **Total** | — | **~17–22 días** de trabajo senior full-time | — |

**Orden recomendado de ejecución:** 1 → 2 → 3 → 4 (cada una mergeada solo con tests pasando y sin romper el anterior).

---

## 📐 Actualización 1 — Paquetes de Consultas

### Modelo de datos

```sql
-- A) Plantilla de paquete (catálogo que define admin o doctor)
CREATE TABLE package_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  sessions_count  int  NOT NULL CHECK (sessions_count > 0),
  price_usd       numeric NOT NULL CHECK (price_usd >= 0),
  validity_days   int NOT NULL DEFAULT 180,            -- vigencia desde compra
  specialty       text,                                  -- NULL = cualquier especialidad
  doctor_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,  -- NULL = cualquier doctor de la especialidad
  expiry_policy   text NOT NULL DEFAULT 'forfeit'
                    CHECK (expiry_policy IN ('forfeit','refund','extend')),
  is_active       bool DEFAULT true,
  created_by      uuid REFERENCES profiles(id),          -- admin o doctor creador
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
-- Un paquete es o genérico (doctor NULL) o específico (doctor NOT NULL)
-- specialty obligatorio si doctor_id es NULL
ALTER TABLE package_templates ADD CONSTRAINT pt_scope_valid
  CHECK ((doctor_id IS NOT NULL) OR (specialty IS NOT NULL));

-- B) Patient_packages (ya existe, lo amplío)
ALTER TABLE patient_packages
  ADD COLUMN IF NOT EXISTS package_template_id uuid REFERENCES package_templates(id),
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS expiry_policy text DEFAULT 'forfeit',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS purchased_amount_usd numeric,
  ADD COLUMN IF NOT EXISTS notified_one_left bool DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_expiring_soon bool DEFAULT false;

-- C) Log inmutable de movimientos de saldo (auditoría)
CREATE TABLE package_balance_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      uuid NOT NULL REFERENCES patient_packages(id) ON DELETE CASCADE,
  delta           int  NOT NULL,          -- -1 al consumir, +1 al restituir, etc.
  balance_after   int  NOT NULL,          -- snapshot para debugging rápido
  reason          text NOT NULL
                    CHECK (reason IN (
                      'appointment_booked','appointment_cancelled',
                      'admin_adjustment','expired_forfeit','refund',
                      'extension_granted','initial_allocation')),
  appointment_id  uuid REFERENCES appointments(id) ON DELETE SET NULL,
  actor_id        uuid REFERENCES profiles(id),
  notes           text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_pbl_package ON package_balance_log(package_id, created_at DESC);
```

### RPCs (transaccionales)

```sql
-- Consumo de sesión: ya existe book_with_package; lo extiendo para escribir en el log.
-- Restitución al cancelar: restore_package_session(package_id, appointment_id, actor_id)
-- Ajuste manual por admin: adjust_package_balance(package_id, delta, reason, notes)
```

### Reglas de negocio

- Trigger `BEFORE INSERT` en `patient_packages` → si `expires_at` NULL, calcularlo con `now() + validity_days`.
- Trigger `AFTER UPDATE` en `patient_packages` → si `used_sessions` cambia, registrar en `package_balance_log`.
- CRON job (Edge Function o pg_cron): barre `patient_packages` con `expires_at < now()` y aplica política (forfeit/refund/extend).
- Notificación "queda 1 sesión" → trigger + worker WhatsApp/email (placeholder por ahora, real cuando se implemente la Edge Function).

### UI impactada

- **Nuevo**: `/admin/packages` — listar, crear, editar, activar/desactivar package_templates.
- **Nuevo**: `/admin/packages/sales` — reporte de paquetes vendidos/consumidos/vencidos.
- **Extender**: `/doctor/patients/[id]` — panel "Paquetes activos" con saldo en vivo.
- **Extender**: `/patient/dashboard` — cards con saldo + botón "Agendar" por paquete.
- **Extender**: `/api/book/route.ts` — ya usa RPC; añadir validación de `specialty` y `expires_at`.

---

## 📐 Actualización 2 — Plantillas Multi-Especialidad

### Decisión de diseño: **Opción A (Catálogo + activación/renombrado)**

**Justificación:**

| Criterio | Opción A (catálogo) | Opción B (plantillas por especialidad) |
|---|---|---|
| Añadir nueva especialidad sin código | ✅ Sí | ❌ Requiere crear plantilla |
| Lógica interna única | ✅ Un solo render loop | ⚠️ Múltiples plantillas |
| Mantenibilidad | ✅ Simple | ⚠️ Cada plantilla es código |
| Flexibilidad por doctor | ✅ Total | ⚠️ Dentro de la plantilla |
| Migración de `doctor_templates` existente | ⚠️ Media | ❌ Alta (reemplazar todo) |

**Conclusión:** Opción A, con seed inicial que pre-configura bloques por especialidad (lo mejor de ambos mundos — el doctor arranca con defaults razonables y puede personalizar).

### Modelo de datos

```sql
-- A) Catálogo maestro (seed inmutable, admin puede añadir más)
CREATE TABLE consultation_block_catalog (
  key                       text PRIMARY KEY,              -- slug: 'prescription','rest','tasks'
  default_label             text NOT NULL,                  -- 'Prescripción'
  default_content_type      text NOT NULL DEFAULT 'rich_text'
                              CHECK (default_content_type IN
                                ('rich_text','list','date','file','structured','numeric')),
  default_printable         bool DEFAULT true,
  default_send_to_patient   bool DEFAULT true,
  description               text,
  created_at                timestamptz DEFAULT now()
);

-- B) Config por doctor (sobrescribe los defaults del catálogo)
CREATE TABLE doctor_consultation_blocks (
  doctor_id         uuid REFERENCES profiles(id) ON DELETE CASCADE,
  block_key         text REFERENCES consultation_block_catalog(key) ON DELETE CASCADE,
  custom_label      text,                -- NULL = usar default_label del catálogo
  custom_content_type text,               -- NULL = usar default del catálogo
  enabled           bool DEFAULT true,
  sort_order        int DEFAULT 0,
  printable         bool,
  send_to_patient   bool,
  PRIMARY KEY (doctor_id, block_key)
);

-- C) Seed de bloques por especialidad (se aplican cuando doctor no tiene config propia)
CREATE TABLE specialty_default_blocks (
  specialty     text,
  block_key     text REFERENCES consultation_block_catalog(key),
  enabled       bool DEFAULT true,
  sort_order    int DEFAULT 0,
  PRIMARY KEY (specialty, block_key)
);

-- D) Snapshot inmutable en cada consulta (para retrocompat)
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS blocks_snapshot jsonb;
-- Ejemplo: [{"key":"prescription","label":"Prescripción","content":"...","order":1}, ...]
```

### Seed inicial (se aplica al correr la migración)

```
catalog: prescription, rest, tasks, nutrition_plan, exercises,
         indications, recommendations, diagnosis, internal_notes,
         requested_exams, next_followup

specialty_default_blocks:
  Medicina General     → prescription, rest, indications, diagnosis, next_followup
  Psicología            → tasks, indications, recommendations, next_followup, internal_notes
  Nutrición             → nutrition_plan, recommendations, next_followup, requested_exams
  Fisioterapia          → exercises, indications, rest, next_followup
  Pediatría             → prescription, rest, indications, diagnosis, next_followup
  (defaults genéricos para especialidades no mapeadas)
```

### Lógica de resolución

```ts
// Helper: resolveDoctorBlocks(doctorId, specialty)
//   1. Lee doctor_consultation_blocks (si tiene)
//   2. Si NO tiene → aplica specialty_default_blocks por specialty
//   3. Si tampoco → aplica defaults del catálogo
//   4. Merge con custom_label / printable / send_to_patient
// Retorna: [{key, label, content_type, printable, send_to_patient, sort_order}]
```

### Reglas de negocio

- Al crear una consulta se serializa `blocks_snapshot` con la config vigente del doctor.
- Al mostrar una consulta vieja → SIEMPRE usar `blocks_snapshot` (no recalcular).
- Al cambiar config del doctor → solo afecta consultas futuras.
- Constraint: `doctor_consultation_blocks` debe tener al menos 1 bloque `enabled=true` por doctor.
- Plantillas imprimibles (`printable=true`) se usan en PDF/email/WhatsApp.

### UI impactada

- **Nuevo**: `/doctor/settings/consultation-blocks` — config personal (activar/desactivar/renombrar/reordenar con drag-handle).
- **Nuevo**: `/admin/consultation-blocks` — catálogo maestro + defaults por especialidad.
- **Reemplazar**: sección de consulta en `/doctor/consultations` — ahora renderiza bloques dinámicos.
- **Migración obligatoria de `doctor_templates`**: convertir plantillas existentes a blocks.

---

## 📐 Actualización 3 — Agenda tipo Google Calendar

### Biblioteca elegida: **FullCalendar React**

**Justificación:**
- Soporte nativo de vistas día/semana/mes, drag&drop, resize, timezone.
- Integración React oficial mantenida.
- Plugin `rrule` para recurrencias.
- Alternativa `react-big-calendar` — más ligera pero menos features y menos mantenida.
- Implementación custom = ~8 semanas de trabajo; descartada.

### Modelo de datos (refuerzo de integridad)

```sql
-- A) Log inmutable de cambios sobre appointments
CREATE TABLE appointment_changes_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  actor_id        uuid REFERENCES profiles(id),
  actor_role      text,                         -- snapshot en el momento del cambio
  action          text NOT NULL CHECK (action IN (
                    'created','rescheduled','cancelled','completed',
                    'no_show','in_progress','duration_changed','notes_updated',
                    'reminder_sent','admin_override')),
  field_changed   text,
  old_value       text,
  new_value       text,
  reason          text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_acl_appt ON appointment_changes_log(appointment_id, created_at DESC);

-- B) Trigger que registra TODOS los UPDATE
CREATE OR REPLACE FUNCTION log_appointment_updates() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scheduled_at <> OLD.scheduled_at THEN
    INSERT INTO appointment_changes_log (appointment_id, action, field_changed, old_value, new_value, actor_id)
    VALUES (NEW.id, 'rescheduled', 'scheduled_at', OLD.scheduled_at::text, NEW.scheduled_at::text, current_setting('app.current_user_id', true)::uuid);
  END IF;
  -- ... más campos
  RETURN NEW;
END $$;
CREATE TRIGGER trg_appointment_changes_log
  AFTER UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION log_appointment_updates();

-- C) RPC ÚNICO para reagendar (evita UPDATE directo)
CREATE OR REPLACE FUNCTION reschedule_appointment(
  p_appointment_id uuid,
  p_new_scheduled_at timestamptz,
  p_reason text
) RETURNS void SECURITY DEFINER AS $$
DECLARE v_caller_role text; v_appt_doctor uuid;
BEGIN
  -- Solo el doctor owner o super_admin puede reagendar
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  SELECT doctor_id INTO v_appt_doctor FROM appointments WHERE id = p_appointment_id;
  IF auth.uid() <> v_appt_doctor AND v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'UNAUTHORIZED_RESCHEDULE';
  END IF;
  -- Detectar conflictos en el nuevo slot
  IF EXISTS (SELECT 1 FROM appointments WHERE doctor_id = v_appt_doctor
             AND scheduled_at = p_new_scheduled_at AND id <> p_appointment_id
             AND status IN ('scheduled','confirmed','pending','accepted')) THEN
    RAISE EXCEPTION 'SLOT_CONFLICT';
  END IF;
  UPDATE appointments SET scheduled_at = p_new_scheduled_at WHERE id = p_appointment_id;
END $$;
```

### Integridad — cómo garantizamos que "una cita no se mueve sola"

1. **Trigger BD** registra en log cualquier UPDATE con `actor_id`.
2. **Frontend** llama siempre a RPC `reschedule_appointment` (nunca UPDATE directo).
3. **RLS** en `appointments` deniega UPDATE a columnas críticas (`scheduled_at`, `doctor_id`) a roles que no sean `service_role` — el frontend solo puede invocar la RPC.
4. **Confirmación modal** antes de cualquier drag&drop que cambie hora.
5. **Edge Functions / jobs** NO tocan appointments directamente; si necesitan, llaman la RPC.
6. Cambios de `doctor_schedule_config` → **nunca** mueven citas existentes (solo afectan slots disponibles futuros).

### Componente React

```
app/doctor/agenda/
  page.tsx                    (orquestador)
  AgendaCalendar.tsx          (wrapper FullCalendar con timezone fijo America/Caracas)
  AppointmentQuickView.tsx    (popover al click sobre cita)
  RescheduleConfirmModal.tsx  (confirmación antes de drag/drop)
  useAppointments.ts          (hook — carga citas + suscripción realtime)
  useScheduleConfig.ts        (hook — lee doctor_schedule_config)
```

### Vista móvil

- FullCalendar tiene vista "listWeek" y scroll vertical nativo.
- Drag&drop táctil funciona con el plugin `interactionPlugin`.

---

## 📐 Actualización 4 — Formulario Unificado

### Arquitectura

```
components/appointment-flow/
  NewAppointmentFlow.tsx          ← componente único (modal o inline)
  steps/
    Step1_Patient.tsx             ← buscador + inline creator
    Step2_DoctorSchedule.tsx      ← fecha + slot (real-time)
    Step3_Pricing.tsx             ← precio + paquete + pago
    Step4_Confirm.tsx             ← resumen + enviar
  components/
    InlinePatientCreator.tsx      ← sub-modal con formulario completo de paciente
    SlotPicker.tsx                ← consume /api/doctor/schedule
    PackageSelector.tsx           ← muestra paquetes aplicables y saldo
  context.ts                      ← tipo `AppointmentContext` con origin info
  validation.ts                   ← zod schema

Puntos de entrada (todos llaman al mismo componente):
  1. <AgendaCalendar> click en slot libre
  2. <AgendaCalendar> botón "Nueva cita"
  3. /doctor/patients/[id] botón "Agendar"
  4. /admin/doctors/[id] botón "Nueva cita"
  5. /patient/dashboard botón "Agendar siguiente"
  6. /book/[doctorId] público (wrapper diferente, usa el mismo flow)
```

### Props del componente

```ts
<NewAppointmentFlow
  open={boolean}
  onClose={() => void}
  onSuccess={(appointmentId: string) => void}
  initialContext={{
    patientId?: string
    doctorId?: string
    slotStart?: string   // ISO
    packageId?: string
    origin: 'agenda_slot' | 'agenda_btn' | 'patient_sheet' | 'admin_panel' | 'patient_portal' | 'public_booking'
  }}
/>
```

### InlinePatientCreator — reglas

- Antes de mostrar el botón "Crear nuevo paciente", el buscador debe devolver 0 resultados.
- Formulario con los mismos campos que `/doctor/patients` (misma validación Zod compartida).
- Antes de guardar: query `patients` por email/cédula → si coincide, mostrar "¿Es este paciente?" con opciones.
- Al crear: INSERT en `patients` (via `/api/doctor/patients`) + select automático en el formulario de cita.

### Concurrencia en slots

- Al cargar el formulario, subscripción realtime a `appointments` del doctor → si alguien toma el slot, se marca como ocupado en vivo.
- Al confirmar, el endpoint `/api/book` hace doble check (ya lo hace).
- Si falla por conflicto, mensaje claro + re-load de slots.

### Puntos de entrada — refactor requerido

| Archivo actual | Acción |
|---|---|
| `/book/[doctorId]/BookingClient.tsx` | Refactor para usar `NewAppointmentFlow` |
| `/doctor/agenda/page.tsx` | Reemplazar su creador actual |
| `/doctor/patients/page.tsx` | "Agendar" abre el modal |
| `/admin/doctors/NewClinicModal.tsx` | N/A (es otro flow) |
| Cualquier inline `<form>` creando appointments | Eliminar |

---

## 🔌 Impacto en módulos existentes

| Módulo | Cambio |
|---|---|
| `/api/book` | Ya usa `book_with_package`. Añadir validación de `specialty` y `expires_at`. |
| `/api/doctor/consultations` | Guardar `blocks_snapshot` al crear (actualización 2). |
| `/doctor/finances` | Reporte nuevo: "Ingresos por paquete vs individual". |
| `/admin/patients` | Agregar columna "Paquetes activos" |
| `/patient/dashboard` | Nueva card con saldo de paquetes |
| WhatsApp templates | Placeholder; implementación real en fase posterior |
| Tests E2E | +15 tests aprox (paquetes, plantillas, agenda, formulario) |

---

## ❓ Preguntas que bloquean el avance

Necesito tus respuestas antes de implementar:

### P1 — Política de vencimiento de paquetes
¿Cuál es la política por defecto cuando un paquete vence con saldo sin usar?
- `forfeit` — se pierde (pro: predictible; con: peor UX paciente)
- `refund` — genera nota de crédito (pro: UX; con: complejidad finanzas)
- `extend` — se extiende 30 días automático (pro: fidelidad; con: puede abusarse)

### P2 — Flexibilidad: ¿doctor puede crear sus propios package_templates?
- Solo admin → más control, consistencia
- Admin + doctor → doctor define paquetes de sus sesiones

### P3 — Agenda: ¿FullCalendar (pago enterprise para algunas features) o custom?
FullCalendar tiene versión MIT gratuita con lo que necesitamos (resource timegrid, drag&drop). La versión premium añade vista "timeline". Para beta → MIT version.

### P4 — Notificaciones (email/WhatsApp)
¿Dejamos placeholder (log en BD pero no envío) o implementamos ya WhatsApp Cloud API?
- Placeholder → 0 días extra
- WhatsApp real → +3 días (Meta Cloud API setup, plantillas aprobadas, worker)

### P5 — Ritmo de ejecución
- **A) Una sesión por actualización** — entregas cada ~1 semana de trabajo mío
- **B) Todo de una** — sesión larga de 2-3h, solo una actualización por sesión
- **C) Mix: empiezo por paquetes (la más independiente), validas, sigues**

### P6 — Tests
¿Quieres que cada actualización incluya tests E2E nuevos (añade ~1 día) o los acumulamos al final?

---

## 📋 Plan de ejecución propuesto (pendiente de tu OK)

**Semana 1 — Paquetes (Actualización 1)**
- Día 1: SQL schema + seed + RPCs + tests SQL
- Día 2: UI `/admin/packages` (CRUD templates)
- Día 3: UI `/doctor/patients/[id]` + `/patient/dashboard` (saldos)
- Día 4: Integración con `/api/book` + notificaciones placeholder
- Día 5: Tests E2E + docs + commit

**Semana 2 — Plantillas multi-especialidad (Actualización 2)**
- Día 1: SQL schema + seed + migración de `doctor_templates`
- Día 2: UI `/doctor/settings/consultation-blocks`
- Día 3: UI `/admin/consultation-blocks` + renderizado dinámico en `/doctor/consultations`
- Día 4: Integración con PDFs/informes
- Día 5: Tests E2E + docs + commit

**Semana 3 — Agenda Google Calendar (Actualización 3)**
- Día 1-2: SQL (log + RPC reschedule) + setup FullCalendar
- Día 3: Vista día/semana/mes
- Día 4: Drag/drop + quick view + confirmación modal
- Día 5: Integración con paquetes + tests + docs

**Semana 4 — Formulario unificado (Actualización 4)**
- Día 1-2: `NewAppointmentFlow` + `InlinePatientCreator` + SlotPicker
- Día 3: Refactor de todos los puntos de entrada
- Día 4: Tests E2E cubriendo cada punto de entrada
- Día 5: Regression full suite + docs + commit final

---

## 🚦 Próximo paso

Responde las **6 preguntas de arriba** (P1-P6) y ejecuto la primera actualización. Mi recomendación (si no opinas distinto):

- P1 → `extend` (30 días automático la primera vez, luego `forfeit`)
- P2 → admin + doctor
- P3 → FullCalendar MIT
- P4 → placeholder (log en BD); WhatsApp real en fase posterior
- P5 → **C (mix)**: empiezo por paquetes, validas, sigo
- P6 → sí, tests E2E por actualización

Con esas respuestas arranco **Actualización 1 (paquetes)** de inmediato.
