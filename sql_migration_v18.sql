-- ============================================================================
-- MedSaaS Venezuela — Migration v18
-- Share message template for doctor WhatsApp/Email sharing
-- ============================================================================

-- Add share_message_template column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS share_message_template text;

-- Set a sensible default for existing doctors
UPDATE profiles
SET share_message_template = 'Hola {paciente}, te envío los documentos de tu consulta del {fecha}: {documentos}. Cualquier duda quedo a tu orden. {doctor}'
WHERE share_message_template IS NULL AND role = 'doctor';

-- Placeholders available:
-- {paciente}   → Patient full name
-- {fecha}      → Consultation date formatted
-- {documentos} → Comma-separated list of selected documents
-- {doctor}     → Doctor full name with title
-- {codigo}     → Consultation code

-- ============================================================================
-- Quick items: reusable exams and medications for fast selection in consultations
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

CREATE POLICY "Doctor manages own quick items" ON doctor_quick_items
  FOR ALL USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- ============================================================================
-- Fix RLS policies missing WITH CHECK (causes INSERT failures)
-- ============================================================================

-- Fix prescriptions RLS
DROP POLICY IF EXISTS "Médico ve sus recetas" ON prescriptions;
CREATE POLICY "Médico gestiona sus recetas" ON prescriptions
  FOR ALL USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Fix consultations RLS (ensure INSERT works)
DROP POLICY IF EXISTS "Médico ve sus consultas" ON consultations;
CREATE POLICY "Médico gestiona sus consultas" ON consultations
  FOR ALL USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Fix ehr_records RLS
DROP POLICY IF EXISTS "Médico ve sus registros" ON ehr_records;
CREATE POLICY "Médico gestiona sus registros" ON ehr_records
  FOR ALL USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());
