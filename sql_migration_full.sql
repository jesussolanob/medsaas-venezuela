-- ═══════════════════════════════════════════════════════════════
-- MedSaaS Venezuela — Migration FULL (v3 + v4 + v5 + prescriptions)
-- Corre este archivo COMPLETO en el SQL Editor de Supabase.
-- Es seguro correrlo varias veces (usa IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

-- 1. Columnas nuevas en profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sound_notifications BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reviewed_by_admin BOOLEAN DEFAULT false;

-- 2. Columna en consultations para pago por seguro
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS insurance_paid_at TIMESTAMPTZ;

-- 3. Cuentas por pagar
CREATE TABLE IF NOT EXISTS accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  concept TEXT,
  amount NUMERIC NOT NULL,
  due_date DATE,
  paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_doctor ON accounts_payable(doctor_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_paid ON accounts_payable(paid);
ALTER TABLE accounts_payable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctor manages their AP" ON accounts_payable;
CREATE POLICY "Doctor manages their AP" ON accounts_payable
  FOR ALL USING (doctor_id = auth.uid());

-- 4. Mensajes CRM (leads)
CREATE TABLE IF NOT EXISTS lead_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  direction TEXT DEFAULT 'out',
  channel TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_messages_lead ON lead_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_messages_doctor ON lead_messages(doctor_id);
ALTER TABLE lead_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctor sees their lead messages" ON lead_messages;
CREATE POLICY "Doctor sees their lead messages" ON lead_messages
  FOR ALL USING (doctor_id = auth.uid());

-- 5. Columnas de leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS message TEXT;

-- 6. Recetas médicas (prescriptions)
CREATE TABLE IF NOT EXISTS prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  medications     JSONB NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_consultation ON prescriptions(consultation_id);
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Medico ve sus recetas" ON prescriptions;
CREATE POLICY "Medico ve sus recetas" ON prescriptions
  FOR ALL USING (doctor_id = auth.uid());

-- 7. Mensajería paciente ↔ doctor
CREATE TABLE IF NOT EXISTS patient_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  direction TEXT DEFAULT 'patient_to_doctor',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pm_patient ON patient_messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_pm_doctor ON patient_messages(doctor_id);
ALTER TABLE patient_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Open patient messages" ON patient_messages;
CREATE POLICY "Open patient messages" ON patient_messages FOR ALL USING (true);

-- 8. Seed de cuentas por pagar (si está vacío)
DO $$
DECLARE
  v_doctor_id UUID;
BEGIN
  SELECT id INTO v_doctor_id FROM profiles ORDER BY created_at LIMIT 1;
  IF v_doctor_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts_payable WHERE doctor_id = v_doctor_id) THEN
    INSERT INTO accounts_payable (doctor_id, vendor_name, concept, amount, due_date, paid)
    VALUES
      (v_doctor_id, 'Alquiler consultorio', 'Mes actual', 500, CURRENT_DATE + INTERVAL '5 days', false),
      (v_doctor_id, 'Proveedor insumos X', 'Insumos médicos', 180, CURRENT_DATE + INTERVAL '12 days', false),
      (v_doctor_id, 'Servicio eléctrico', 'Factura mensual', 35, CURRENT_DATE + INTERVAL '20 days', false),
      (v_doctor_id, 'Internet / Movistar', 'Fibra óptica', 40, CURRENT_DATE - INTERVAL '2 days', true);
  END IF;
END $$;
