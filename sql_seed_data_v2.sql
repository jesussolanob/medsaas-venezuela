-- ═══════════════════════════════════════════════════════════════
-- MedSaaS Venezuela — SQL Seed Data v2
-- Schema updates and sample data for new features
-- ═══════════════════════════════════════════════════════════════

-- 1. Add id_number column to patients (cédula)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS id_number TEXT;

-- 2. Add payment_methods array to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_methods TEXT[];

-- 3. Create doctor_insurances table
CREATE TABLE IF NOT EXISTS doctor_insurances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  credit_days INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctor_insurances_doctor ON doctor_insurances(doctor_id);

ALTER TABLE doctor_insurances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctor manages their insurances" ON doctor_insurances
  FOR ALL USING (doctor_id = auth.uid());

-- 4. Add columns to consultations for insurance payment tracking
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS insurance_name TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS insurance_auth_code TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS amount NUMERIC;

-- 5. Add patient_cedula to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_cedula TEXT;

-- 6. Ensure leads table exists with stage column
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  channel TEXT DEFAULT 'whatsapp',
  stage TEXT DEFAULT 'cold',
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_doctor ON leads(doctor_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctor sees their leads" ON leads
  FOR ALL USING (doctor_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA — Idempotent block using DO $$
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  doctor_id UUID;
  patient_1_id UUID;
  patient_2_id UUID;
  patient_3_id UUID;
  patient_4_id UUID;
  patient_5_id UUID;
  patient_6_id UUID;
  patient_7_id UUID;
  patient_8_id UUID;
  patient_9_id UUID;
  patient_10_id UUID;
  patient_maria_id UUID;
  i INTEGER;
BEGIN
  -- Get the first doctor (superadmin or first profile)
  SELECT id INTO doctor_id FROM profiles WHERE id IS NOT NULL LIMIT 1;

  IF doctor_id IS NULL THEN
    RAISE NOTICE 'No doctor profile found. Skipping seed data.';
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding data for doctor: %', doctor_id;

  -- ─────────────────────────────────────────────────────────────
  -- 1. Create 10 patients (including María González with history)
  -- ─────────────────────────────────────────────────────────────

  INSERT INTO patients (doctor_id, full_name, age, phone, id_number, email, sex, notes, source, created_at)
  VALUES
    (doctor_id, 'Juan Pérez', 45, '+58 412 111 2222', 'V-12345678', 'juan@email.com', 'male', 'Paciente desde 2025', 'manual', NOW()),
    (doctor_id, 'Laura Hernández', 38, '+58 414 333 4444', 'V-23456789', 'laura@email.com', 'female', 'Referido', 'manual', NOW()),
    (doctor_id, 'Carlos Gómez', 52, '+58 424 555 6666', 'V-34567890', 'carlos@email.com', 'male', 'Consultas recurrentes', 'manual', NOW()),
    (doctor_id, 'Ana Rodríguez', 41, '+58 416 777 8888', 'V-45678901', 'ana@email.com', 'female', 'Seguimiento', 'manual', NOW()),
    (doctor_id, 'Isabel García', 36, '+58 412 999 0000', 'V-56789012', 'isabel@email.com', 'female', 'Nueva paciente', 'manual', NOW()),
    (doctor_id, 'Diego López', 58, '+58 414 111 1111', 'V-67890123', 'diego@email.com', 'male', 'Paciente senior', 'manual', NOW()),
    (doctor_id, 'Sofía Martínez', 29, '+58 424 222 2222', 'V-78901234', 'sofia@email.com', 'female', 'Joven paciente', 'manual', NOW()),
    (doctor_id, 'Roberto Flores', 47, '+58 416 333 3333', 'V-89012345', 'roberto@email.com', 'male', 'Primera consulta', 'manual', NOW()),
    (doctor_id, 'Martina Costa', 33, '+58 412 444 4444', 'V-90123456', 'martina@email.com', 'female', 'Por agendar', 'manual', NOW())
  ON CONFLICT DO NOTHING
  RETURNING id INTO patient_1_id, patient_2_id, patient_3_id, patient_4_id, patient_5_id, patient_6_id, patient_7_id, patient_8_id, patient_9_id;

  -- María González with history
  INSERT INTO patients (doctor_id, full_name, age, phone, id_number, email, sex, notes, source)
  VALUES (doctor_id, 'María González', 44, '+58 412 555 5555', 'V-01234567', 'maria@email.com', 'female', 'Paciente de largo plazo con historial', 'manual')
  ON CONFLICT DO NOTHING
  RETURNING id INTO patient_maria_id;

  -- Get IDs if they already exist
  IF patient_1_id IS NULL THEN
    SELECT id INTO patient_1_id FROM patients WHERE doctor_id = doctor_id AND full_name = 'Juan Pérez' LIMIT 1;
    SELECT id INTO patient_2_id FROM patients WHERE doctor_id = doctor_id AND full_name = 'Laura Hernández' LIMIT 1;
    SELECT id INTO patient_3_id FROM patients WHERE doctor_id = doctor_id AND full_name = 'Carlos Gómez' LIMIT 1;
    SELECT id INTO patient_4_id FROM patients WHERE doctor_id = doctor_id AND full_name = 'Ana Rodríguez' LIMIT 1;
    SELECT id INTO patient_5_id FROM patients WHERE doctor_id = doctor_id AND full_name = 'Isabel García' LIMIT 1;
    SELECT id INTO patient_6_id FROM patients WHERE doctor_id = doctor_id AND full_name = 'Diego López' LIMIT 1;
    SELECT id INTO patient_7_id FROM patients WHERE doctor_id = doctor_id AND full_name = 'Sofía Martínez' LIMIT 1;
    SELECT id INTO patient_8_id FROM patients WHERE doctor_id = doctor_id AND full_name = 'Roberto Flores' LIMIT 1;
    SELECT id INTO patient_9_id FROM patients WHERE doctor_id = doctor_id AND full_name = 'Martina Costa' LIMIT 1;
    SELECT id INTO patient_maria_id FROM patients WHERE doctor_id = doctor_id AND full_name = 'María González' LIMIT 1;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- 2. Create 10 appointments (mix of pending/accepted, next 14 days)
  -- ─────────────────────────────────────────────────────────────

  INSERT INTO appointments (
    doctor_id, patient_id, patient_name, patient_phone, patient_email, patient_cedula,
    scheduled_at, chief_complaint, plan_name, plan_price, status, source
  ) VALUES
    (doctor_id, patient_1_id, 'Juan Pérez', '+58 412 111 2222', 'juan@email.com', 'V-12345678', NOW() + INTERVAL '2 days', 'Dolor de cabeza', 'Consulta General', 20, 'scheduled', 'booking'),
    (doctor_id, patient_2_id, 'Laura Hernández', '+58 414 333 4444', 'laura@email.com', 'V-23456789', NOW() + INTERVAL '3 days', 'Chequeo anual', 'Consulta General', 20, 'confirmed', 'booking'),
    (doctor_id, patient_3_id, 'Carlos Gómez', '+58 424 555 6666', 'carlos@email.com', 'V-34567890', NOW() + INTERVAL '4 days', 'Seguimiento diabetes', 'Consulta Especializada', 40, 'scheduled', 'booking'),
    (doctor_id, patient_4_id, 'Ana Rodríguez', '+58 416 777 8888', 'ana@email.com', 'V-45678901', NOW() + INTERVAL '5 days', 'Presión arterial', 'Consulta General', 20, 'confirmed', 'booking'),
    (doctor_id, patient_5_id, 'Isabel García', '+58 412 999 0000', 'isabel@email.com', 'V-56789012', NOW() + INTERVAL '6 days', 'Erupción cutánea', 'Consulta General', 20, 'scheduled', 'booking'),
    (doctor_id, patient_6_id, 'Diego López', '+58 414 111 1111', 'diego@email.com', 'V-67890123', NOW() + INTERVAL '7 days', 'Dolor de espalda', 'Consulta Especializada', 40, 'confirmed', 'booking'),
    (doctor_id, patient_7_id, 'Sofía Martínez', '+58 424 222 2222', 'sofia@email.com', 'V-78901234', NOW() + INTERVAL '8 days', 'Fatiga', 'Consulta General', 20, 'scheduled', 'booking'),
    (doctor_id, patient_8_id, 'Roberto Flores', '+58 416 333 3333', 'roberto@email.com', 'V-89012345', NOW() + INTERVAL '10 days', 'Mareos', 'Consulta Especializada', 40, 'confirmed', 'booking'),
    (doctor_id, patient_9_id, 'Martina Costa', '+58 412 444 4444', 'martina@email.com', 'V-90123456', NOW() + INTERVAL '12 days', 'Alergia', 'Consulta General', 20, 'scheduled', 'booking'),
    (doctor_id, patient_maria_id, 'María González', '+58 412 555 5555', 'maria@email.com', 'V-01234567', NOW() + INTERVAL '14 days', 'Seguimiento crónico', 'Consulta General', 20, 'scheduled', 'booking')
  ON CONFLICT DO NOTHING;

  -- ─────────────────────────────────────────────────────────────
  -- 3. Create 10 consultations with varied payment methods
  -- ─────────────────────────────────────────────────────────────

  INSERT INTO consultations (
    doctor_id, patient_id, consultation_code, chief_complaint, notes, diagnosis, treatment,
    payment_status, payment_method, insurance_name, insurance_auth_code, amount, consultation_date
  ) VALUES
    (doctor_id, patient_1_id, 'CON-20260401-1001', 'Cefalea tensional', 'Paciente reporta estrés laboral', 'Cefalea tipo tensional', 'Reposo, analgésicos', 'approved', 'cash_usd', NULL, NULL, 20, NOW() - INTERVAL '30 days'),
    (doctor_id, patient_2_id, 'CON-20260402-1002', 'Chequeo preventivo', 'Seguimiento anual', 'Sano', 'Recomendaciones generales', 'approved', 'pago_movil', NULL, NULL, 20, NOW() - INTERVAL '25 days'),
    (doctor_id, patient_3_id, 'CON-20260403-1003', 'Diabetes tipo 2', 'Glucose elevado', 'Diabetes descompensada', 'Medicamentos ajustados', 'approved', 'insurance', 'Seguros Mercantil', 'AUTH-2026-001', 20, NOW() - INTERVAL '20 days'),
    (doctor_id, patient_4_id, 'CON-20260404-1004', 'Hipertensión', 'Presión 160/100', 'Hipertensión grado 2', 'Medicamentos, dieta', 'approved', 'transferencia', NULL, NULL, 20, NOW() - INTERVAL '15 days'),
    (doctor_id, patient_5_id, 'CON-20260405-1005', 'Dermatitis', 'Picazón generalizada', 'Alergia de contacto', 'Crema antialérgica', 'pending_approval', 'cash_usd', NULL, NULL, 20, NOW() - INTERVAL '10 days'),
    (doctor_id, patient_6_id, 'CON-20260406-1006', 'Lumbalgia', 'Dolor lumbar crónico', 'Lumbago crónico', 'Fisioterapia, medicamentos', 'approved', 'zelle', NULL, NULL, 40, NOW() - INTERVAL '8 days'),
    (doctor_id, patient_7_id, 'CON-20260407-1007', 'Astenia', 'Cansancio extremo', 'Síndrome de fatiga', 'Descanso, vitaminas', 'unpaid', 'insurance', 'Mapfre', 'AUTH-2026-002', 20, NOW() - INTERVAL '5 days'),
    (doctor_id, patient_8_id, 'CON-20260408-1008', 'Vértigo', 'Mareos posicionales', 'Vértigo postural', 'Maniobra Epley', 'approved', 'pago_movil', NULL, NULL, 40, NOW() - INTERVAL '3 days'),
    (doctor_id, patient_9_id, 'CON-20260409-1009', 'Rinitis alérgica', 'Estornudos, congestión', 'Alergia estacional', 'Antihistamínico', 'approved', 'cash_usd', NULL, NULL, 20, NOW() - INTERVAL '2 days'),
    (doctor_id, patient_maria_id, 'CON-20260410-1010', 'Revisión crónica', 'Paciente regular', 'Hipertensión estable', 'Mantener medicamentos', 'approved', 'insurance', 'La Previsora', 'AUTH-2026-003', 20, NOW() - INTERVAL '1 day')
  ON CONFLICT DO NOTHING;

  -- Add 3 more consultations for María González (history)
  INSERT INTO consultations (
    doctor_id, patient_id, consultation_code, chief_complaint, notes, diagnosis, treatment,
    payment_status, payment_method, insurance_name, amount, consultation_date
  ) VALUES
    (doctor_id, patient_maria_id, 'CON-20260301-2001', 'Controlchequeo semestral', 'Revisión de medicamentos', 'Hipertensión controlada', 'Mantener dosis', 'approved', 'insurance', 'La Previsora', 20, NOW() - INTERVAL '60 days'),
    (doctor_id, patient_maria_id, 'CON-20260201-2002', 'Incremento de presión', 'Presión 150/95', 'Hipertensión grado 1', 'Aumento de medicamento', 'approved', 'insurance', 'La Previsora', 20, NOW() - INTERVAL '90 days'),
    (doctor_id, patient_maria_id, 'CON-20260101-2003', 'Consulta inicial 2026', 'Nueva evaluación integral', 'Hipertensión', 'Plan de tratamiento', 'approved', 'insurance', 'La Previsora', 20, NOW() - INTERVAL '120 days')
  ON CONFLICT DO NOTHING;

  -- ─────────────────────────────────────────────────────────────
  -- 4. Create 3 doctor insurances
  -- ─────────────────────────────────────────────────────────────

  INSERT INTO doctor_insurances (doctor_id, name, credit_days, notes)
  VALUES
    (doctor_id, 'Seguros Mercantil', 10, 'Requiere autorización previa. Pago en 10 días.'),
    (doctor_id, 'Mapfre', 15, 'Plazo de pago flexible. Contactar departamento de cobranzas.'),
    (doctor_id, 'La Previsora', 30, 'Pago mensual. Incluye copia de cédula del paciente.')
  ON CONFLICT DO NOTHING;

  -- ─────────────────────────────────────────────────────────────
  -- 5. Update profile with payment methods
  -- ─────────────────────────────────────────────────────────────

  UPDATE profiles
  SET payment_methods = ARRAY['pago_movil', 'transferencia', 'cash_usd', 'zelle']
  WHERE id = doctor_id
  AND payment_methods IS NULL;

  RAISE NOTICE 'Seed data completed successfully for doctor %', doctor_id;

END $$;
