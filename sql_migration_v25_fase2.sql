-- =============================================================================
-- MIGRATION v25 — Fase 2: Paquetes + Plantillas + Agenda + Formulario Unificado
-- Fecha: 2026-04-21
-- Estado: ya ejecutado en Supabase vía watcher; este archivo deja constancia
-- para que el repo siga siendo fuente de verdad.
-- =============================================================================

-- ─── 1. Paquetes de consultas ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.package_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  sessions_count  int  NOT NULL CHECK (sessions_count > 0),
  price_usd       numeric NOT NULL CHECK (price_usd >= 0),
  specialty       text,
  doctor_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active       boolean DEFAULT true,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT pt_scope_valid CHECK (doctor_id IS NOT NULL OR specialty IS NOT NULL)
);
ALTER TABLE public.package_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patient_packages
  ADD COLUMN IF NOT EXISTS package_template_id uuid REFERENCES public.package_templates(id),
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS purchased_amount_usd numeric,
  ADD COLUMN IF NOT EXISTS notified_one_left boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.package_balance_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      uuid NOT NULL REFERENCES public.patient_packages(id) ON DELETE CASCADE,
  delta           int  NOT NULL,
  balance_after   int  NOT NULL,
  reason          text NOT NULL CHECK (reason IN (
                    'appointment_booked','appointment_cancelled',
                    'admin_adjustment','refund','initial_allocation','doctor_adjustment')),
  appointment_id  uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  actor_id        uuid REFERENCES public.profiles(id),
  notes           text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pbl_package ON public.package_balance_log(package_id, created_at DESC);
ALTER TABLE public.package_balance_log ENABLE ROW LEVEL SECURITY;

-- RPCs (definidas en 022_packages_schema.sql):
--   book_with_package(), restore_package_session(), adjust_package_balance()

-- ─── 2. Plantillas multi-especialidad ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consultation_block_catalog (
  key                       text PRIMARY KEY,
  default_label             text NOT NULL,
  default_content_type      text NOT NULL DEFAULT 'rich_text',
  default_printable         boolean DEFAULT true,
  default_send_to_patient   boolean DEFAULT true,
  description               text,
  created_at                timestamptz DEFAULT now()
);
ALTER TABLE public.consultation_block_catalog ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.doctor_consultation_blocks (
  doctor_id           uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  block_key           text REFERENCES public.consultation_block_catalog(key) ON DELETE CASCADE,
  custom_label        text,
  custom_content_type text,
  enabled             boolean DEFAULT true,
  sort_order          int DEFAULT 0,
  printable           boolean,
  send_to_patient     boolean,
  updated_at          timestamptz DEFAULT now(),
  PRIMARY KEY (doctor_id, block_key)
);
ALTER TABLE public.doctor_consultation_blocks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.specialty_default_blocks (
  specialty     text,
  block_key     text REFERENCES public.consultation_block_catalog(key),
  enabled       boolean DEFAULT true,
  sort_order    int DEFAULT 0,
  PRIMARY KEY (specialty, block_key)
);
ALTER TABLE public.specialty_default_blocks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS blocks_snapshot jsonb;

-- Seed inicial en 023_consultation_blocks.sql:
-- 15 bloques en catálogo, 44 entradas por especialidad (7 specialties)

-- ─── 3. Agenda: log inmutable + integridad ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_changes_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  actor_id        uuid REFERENCES public.profiles(id),
  actor_role      text,
  action          text NOT NULL,
  field_changed   text,
  old_value       text,
  new_value       text,
  reason          text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acl_appt ON public.appointment_changes_log(appointment_id, created_at DESC);
ALTER TABLE public.appointment_changes_log ENABLE ROW LEVEL SECURITY;

-- Triggers + RPCs definidas en 024_agenda_integrity.sql:
--   trg_log_appointment_update, trg_log_appointment_insert
--   reschedule_appointment(), change_appointment_status()

-- ─── 4. Formulario unificado ─────────────────────────────────────────────
-- No requiere cambios de schema; es componente React
-- components/appointment-flow/NewAppointmentFlow.tsx
-- Usa /api/book existente (ya integrado con book_with_package RPC)

-- =============================================================================
-- FIN migration v25
-- =============================================================================
