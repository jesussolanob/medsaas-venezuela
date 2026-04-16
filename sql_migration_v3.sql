-- ═══════════════════════════════════════════════════════════════
-- MedSaaS Venezuela — Migration v3
-- Nuevas columnas y tablas para: logo, payment_details, sonido,
-- cuentas por pagar, insurance_paid_at, lead_messages
-- ═══════════════════════════════════════════════════════════════

-- 1. Columnas nuevas en profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sound_notifications BOOLEAN DEFAULT true;

-- 2. Columna nueva en consultations para rastrear pago por seguro
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

-- 4. Mensajes en leads (CRM chat tipo Kommo)
CREATE TABLE IF NOT EXISTS lead_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  direction TEXT DEFAULT 'out',      -- 'in' (recibido) / 'out' (enviado)
  channel TEXT,                       -- whatsapp, instagram, facebook, web, llamada, referido
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_messages_lead ON lead_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_messages_doctor ON lead_messages(doctor_id);

ALTER TABLE lead_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctor sees their lead messages" ON lead_messages;
CREATE POLICY "Doctor sees their lead messages" ON lead_messages
  FOR ALL USING (doctor_id = auth.uid());

-- 5. Asegurar que leads tenga la columna 'stage' con todos los valores
-- (ya se maneja en seed_v2_fixed, pero lo dejamos por seguridad)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS message TEXT;

-- 6. Seed de cuentas por pagar de ejemplo (opcional, solo si no hay)
DO $$
DECLARE
  v_doctor_id UUID;
BEGIN
  SELECT id INTO v_doctor_id FROM profiles ORDER BY created_at LIMIT 1;
  IF v_doctor_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM accounts_payable WHERE doctor_id = v_doctor_id) THEN
    INSERT INTO accounts_payable (doctor_id, vendor_name, concept, amount, due_date, paid)
    VALUES
      (v_doctor_id, 'Alquiler consultorio', 'Mes actual',         500,  CURRENT_DATE + INTERVAL '5 days',  false),
      (v_doctor_id, 'Proveedor insumos X',  'Insumos médicos',    180,  CURRENT_DATE + INTERVAL '12 days', false),
      (v_doctor_id, 'Servicio eléctrico',   'Factura mensual',    35,   CURRENT_DATE + INTERVAL '20 days', false),
      (v_doctor_id, 'Internet / Movistar',  'Fibra óptica',       40,   CURRENT_DATE - INTERVAL '2 days',  true);
  END IF;
END $$;
