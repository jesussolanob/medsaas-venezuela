-- Migration v5: Patient Messages table
-- Created: 2026-04-15

CREATE TABLE IF NOT EXISTS patient_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  direction TEXT DEFAULT 'patient_to_doctor', -- 'patient_to_doctor' | 'doctor_to_patient'
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_patient ON patient_messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_pm_doctor ON patient_messages(doctor_id);
CREATE INDEX IF NOT EXISTS idx_pm_created ON patient_messages(created_at DESC);

ALTER TABLE patient_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Open patient messages" ON patient_messages;
CREATE POLICY "Open patient messages" ON patient_messages FOR ALL USING (true);
