-- ============================================================================
-- MedSaaS Venezuela — Migration v20 (UNIFICADA)
-- EJECUTAR ESTE ARCHIVO EN SUPABASE SQL EDITOR
-- Incluye TODAS las columnas y tablas necesarias
-- ============================================================================

-- ============================================================================
-- 1. PROFILES: columnas adicionales
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS share_message_template TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_phone_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sound_notifications BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allows_online BOOLEAN DEFAULT true;

-- Set default share message for doctors without one
UPDATE profiles
SET share_message_template = 'Hola {paciente}, te envio los documentos de tu consulta del {fecha}: {documentos}. Cualquier duda quedo a tu orden. {doctor}'
WHERE share_message_template IS NULL AND role = 'doctor';

-- ============================================================================
-- 2. CONSULTATIONS: columnas adicionales
-- ============================================================================
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS plan_name TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- 3. PATIENTS: birth_date
-- ============================================================================
ALTER TABLE patients ADD COLUMN IF NOT EXISTS birth_date DATE;

-- ============================================================================
-- 4. DOCTOR_QUICK_ITEMS: examenes y medicamentos frecuentes
-- ============================================================================
CREATE TABLE IF NOT EXISTS doctor_quick_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('exam', 'medication')),
  name TEXT NOT NULL,
  category TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_items_doctor ON doctor_quick_items(doctor_id);
CREATE INDEX IF NOT EXISTS idx_quick_items_type ON doctor_quick_items(doctor_id, item_type);

ALTER TABLE doctor_quick_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor manages own quick items" ON doctor_quick_items;
CREATE POLICY "Doctor manages own quick items" ON doctor_quick_items
  FOR ALL USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- ============================================================================
-- 5. DOCTOR_TEMPLATES: configuracion de plantillas PDF
-- ============================================================================
CREATE TABLE IF NOT EXISTS doctor_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL DEFAULT 'informe',
  show_logo BOOLEAN DEFAULT true,
  logo_url TEXT,
  show_signature BOOLEAN DEFAULT true,
  signature_url TEXT,
  header_text TEXT,
  footer_text TEXT,
  primary_color TEXT DEFAULT '#0891b2',
  font_family TEXT DEFAULT 'Inter',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, template_type)
);

ALTER TABLE doctor_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor manages own templates" ON doctor_templates;
CREATE POLICY "Doctor manages own templates" ON doctor_templates
  FOR ALL USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- ============================================================================
-- 6. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_consultations_created_at ON consultations(created_at);
CREATE INDEX IF NOT EXISTS idx_consultations_payment_status ON consultations(payment_status);
CREATE INDEX IF NOT EXISTS idx_consultations_plan_name ON consultations(plan_name);

-- ============================================================================
-- 7. FIX RLS POLICIES (ensure INSERT works, not just SELECT)
-- ============================================================================

-- Fix prescriptions RLS
DROP POLICY IF EXISTS "Medico ve sus recetas" ON prescriptions;
DROP POLICY IF EXISTS "Médico ve sus recetas" ON prescriptions;
DROP POLICY IF EXISTS "Médico gestiona sus recetas" ON prescriptions;
CREATE POLICY "Medico gestiona sus recetas" ON prescriptions
  FOR ALL USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Fix consultations RLS
DROP POLICY IF EXISTS "Medico ve sus consultas" ON consultations;
DROP POLICY IF EXISTS "Médico ve sus consultas" ON consultations;
DROP POLICY IF EXISTS "Médico gestiona sus consultas" ON consultations;
CREATE POLICY "Medico gestiona sus consultas" ON consultations
  FOR ALL USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Fix ehr_records RLS
DROP POLICY IF EXISTS "Medico ve sus registros" ON ehr_records;
DROP POLICY IF EXISTS "Médico ve sus registros" ON ehr_records;
DROP POLICY IF EXISTS "Médico gestiona sus registros" ON ehr_records;
CREATE POLICY "Medico gestiona sus registros" ON ehr_records
  FOR ALL USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- ============================================================================
-- 8. STORAGE BUCKET for shared docs
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('shared-docs', 'shared-docs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public reads
DROP POLICY IF EXISTS "Public read shared-docs" ON storage.objects;
CREATE POLICY "Public read shared-docs" ON storage.objects
  FOR SELECT USING (bucket_id = 'shared-docs');

-- Allow authenticated uploads
DROP POLICY IF EXISTS "Auth upload shared-docs" ON storage.objects;
CREATE POLICY "Auth upload shared-docs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'shared-docs' AND auth.role() = 'authenticated');

-- Allow authenticated updates (upsert)
DROP POLICY IF EXISTS "Auth update shared-docs" ON storage.objects;
CREATE POLICY "Auth update shared-docs" ON storage.objects
  FOR UPDATE USING (bucket_id = 'shared-docs' AND auth.role() = 'authenticated');

-- ============================================================================
-- DONE! All migrations applied successfully.
-- ============================================================================
