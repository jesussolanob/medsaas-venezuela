-- =============================================
-- MIGRATION V13: Fix booking flow + ensure all columns
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Ensure patients table has auth_user_id and cedula
ALTER TABLE patients ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS cedula VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_patients_auth_user ON patients(auth_user_id);

-- 2. Ensure appointments table has ALL needed columns
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'direct';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS insurance_name TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_cedula VARCHAR(20);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_mode TEXT DEFAULT 'presencial';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS package_id UUID;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS session_number INTEGER;

-- 3. Copy appointment_date → scheduled_at if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='appointments' AND column_name='appointment_date'
  ) THEN
    UPDATE appointments SET scheduled_at = appointment_date WHERE scheduled_at IS NULL;
  END IF;
END $$;

-- 4. Default status = 'scheduled'
ALTER TABLE appointments ALTER COLUMN status SET DEFAULT 'scheduled';

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_appointments_auth_user ON appointments(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);

-- 6. RLS policies for appointments (patients + doctors)
DROP POLICY IF EXISTS "Patients see their own appointments" ON appointments;
CREATE POLICY "Patients see their own appointments" ON appointments
  FOR SELECT USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

DROP POLICY IF EXISTS "Patients insert their own appointments" ON appointments;
CREATE POLICY "Patients insert their own appointments" ON appointments
  FOR INSERT WITH CHECK (auth_user_id = auth.uid() OR doctor_id = auth.uid());

DROP POLICY IF EXISTS "Doctors update their appointments" ON appointments;
CREATE POLICY "Doctors update their appointments" ON appointments
  FOR UPDATE USING (doctor_id = auth.uid());

-- 7. RLS policies for patients
DROP POLICY IF EXISTS "Patient sees own row" ON patients;
CREATE POLICY "Patient sees own row" ON patients
  FOR SELECT USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

DROP POLICY IF EXISTS "Patient inserts own row" ON patients;
CREATE POLICY "Patient inserts own row" ON patients
  FOR INSERT WITH CHECK (auth_user_id = auth.uid() OR doctor_id = auth.uid());

-- 8. Ensure doctor_services table exists (from v12)
CREATE TABLE IF NOT EXISTS doctor_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_usd NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE doctor_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctor manages services" ON doctor_services;
CREATE POLICY "Doctor manages services" ON doctor_services
  FOR ALL USING (doctor_id = auth.uid());
DROP POLICY IF EXISTS "Doctor inserts services" ON doctor_services;
CREATE POLICY "Doctor inserts services" ON doctor_services
  FOR INSERT WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_doctor_services_doctor_id ON doctor_services(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_services_is_active ON doctor_services(is_active);

-- 9. Ensure patient_packages table exists
CREATE TABLE IF NOT EXISTS patient_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  auth_user_id UUID REFERENCES auth.users(id),
  plan_name TEXT,
  total_sessions INTEGER DEFAULT 1,
  used_sessions INTEGER DEFAULT 0,
  price_usd NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE patient_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Packages visible to doctor and patient" ON patient_packages;
CREATE POLICY "Packages visible to doctor and patient" ON patient_packages
  FOR ALL TO authenticated USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

-- Done! Run this before testing booking flow.
