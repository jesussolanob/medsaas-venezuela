-- ═══════════════════════════════════════════════════════════════
-- Delta Medical CRM — Migraciones SQL necesarias
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Agregar campo sexo a profiles (registro de médicos)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sex TEXT;

-- 2. Tabla patients (pacientes de cada médico)
CREATE TABLE IF NOT EXISTS patients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  age           INTEGER,
  phone         TEXT,
  cedula        TEXT,
  email         TEXT,
  sex           TEXT,          -- 'male' | 'female'
  notes         TEXT,
  source        TEXT DEFAULT 'manual', -- 'manual' | 'invitation' | 'whatsapp'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda por doctor
CREATE INDEX IF NOT EXISTS idx_patients_doctor ON patients(doctor_id);

-- RLS para patients
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Médico ve sus propios pacientes" ON patients
  FOR ALL USING (
    doctor_id = (SELECT id FROM profiles WHERE id = auth.uid())
  );

-- 3. Tabla consultations (historial clínico + estado de pago)
CREATE TABLE IF NOT EXISTS consultations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_code    TEXT NOT NULL UNIQUE,  -- e.g. CON-20240115-1234
  patient_id           UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chief_complaint      TEXT,
  notes                TEXT,
  diagnosis            TEXT,
  treatment            TEXT,
  payment_status       TEXT NOT NULL DEFAULT 'unpaid',
    -- 'unpaid' | 'pending_approval' | 'approved'
  consultation_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_doctor  ON consultations(doctor_id);
CREATE INDEX IF NOT EXISTS idx_consultations_date    ON consultations(consultation_date);

-- RLS para consultations
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Médico ve sus propias consultas" ON consultations
  FOR ALL USING (doctor_id = auth.uid());

-- 4. Tabla payment_accounts (para admin) — si no existe
CREATE TABLE IF NOT EXISTS payment_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,          -- 'pago_movil' | 'transfer' | 'zelle' | 'otro'
  bank_name       TEXT,
  account_holder  TEXT,
  phone           TEXT,
  rif             TEXT,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Actualizar doctor_invitations (si existe, agregar columnas)
ALTER TABLE doctor_invitations ADD COLUMN IF NOT EXISTS patient_name TEXT;
ALTER TABLE doctor_invitations ADD COLUMN IF NOT EXISTS patient_phone TEXT;
ALTER TABLE doctor_invitations ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
-- Si no existe:
CREATE TABLE IF NOT EXISTS doctor_invitations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token          TEXT NOT NULL UNIQUE,
  doctor_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_name   TEXT NOT NULL,
  patient_phone  TEXT NOT NULL,
  used_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para doctor_invitations
ALTER TABLE doctor_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Médico ve sus invitaciones" ON doctor_invitations
  FOR ALL USING (doctor_id = auth.uid());
-- Acceso público para validar token (portales de pacientes)
CREATE POLICY "Público puede leer por token" ON doctor_invitations
  FOR SELECT USING (true);

-- 6. Tabla pricing_plans (planes de consulta por médico)
CREATE TABLE IF NOT EXISTS pricing_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  price_usd        NUMERIC(10,2) NOT NULL DEFAULT 20,
  duration_minutes INTEGER DEFAULT 30,
  sessions_count   INTEGER DEFAULT 1,  -- número de consultas incluidas (paquetes)
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
-- Si la tabla ya existe, agregar la columna sessions_count
ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS sessions_count INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_pricing_plans_doctor ON pricing_plans(doctor_id);
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Médico gestiona sus planes" ON pricing_plans
  FOR ALL USING (doctor_id = auth.uid());
CREATE POLICY "Público puede ver planes activos" ON pricing_plans
  FOR SELECT USING (is_active = true);

-- 7. Agregar columnas faltantes a patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT;

-- 8. Tabla prescriptions (recetas médicas)
CREATE TABLE IF NOT EXISTS prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  medications     JSONB NOT NULL,  -- Array de {name, dose, frequency, duration, indications}
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_consultation ON prescriptions(consultation_id);

-- RLS para prescriptions
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Médico ve sus recetas" ON prescriptions
  FOR ALL USING (doctor_id = auth.uid());

-- 9. Bucket de Supabase Storage para comprobantes de pago
-- Crear manualmente en Supabase Dashboard:
-- Storage → New Bucket → Name: "payment-receipts" → Public: true

-- ═══════════════════════════════════════════════════════════════
-- Insertar datos de prueba (opcional)
-- ═══════════════════════════════════════════════════════════════
-- INSERT INTO payment_accounts (type, bank_name, account_holder, phone, rif)
-- VALUES
--   ('pago_movil', 'Banesco', 'Delta Medical SRL', '0412-555-0000', 'J-12345678-9'),
--   ('transfer', 'Mercantil', 'Delta Medical SRL', NULL, 'J-12345678-9');
