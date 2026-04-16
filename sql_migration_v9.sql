-- ═══════════════════════════════════════════════════════════════
-- Migration v9 — Fix RLS policies for booking flow + roles table
-- Idempotente y defensivo.
-- ═══════════════════════════════════════════════════════════════

-- Ensure RLS is enabled
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- ─── PATIENTS ────────────────────────────────────────────────
-- Drop old restrictive policies
DROP POLICY IF EXISTS "Patient inserts own row" ON patients;
DROP POLICY IF EXISTS "Patient sees own row" ON patients;
DROP POLICY IF EXISTS "Patient updates own row" ON patients;

-- Any authenticated user can INSERT a patient row (needed for booking)
CREATE POLICY "Authenticated insert patients" ON patients
  FOR INSERT TO authenticated WITH CHECK (true);

-- See own rows (as patient via auth_user_id, or as doctor via doctor_id)
CREATE POLICY "See own patients" ON patients
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

-- Update own row
CREATE POLICY "Update own patient" ON patients
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

-- ─── APPOINTMENTS ────────────────────────────────────────────
DROP POLICY IF EXISTS "Patients see their own appointments" ON appointments;
DROP POLICY IF EXISTS "Patients insert their own appointments" ON appointments;
DROP POLICY IF EXISTS "Doctors update their appointments" ON appointments;

-- Any authenticated user can INSERT an appointment (booking flow)
CREATE POLICY "Authenticated insert appointments" ON appointments
  FOR INSERT TO authenticated WITH CHECK (true);

-- See own appointments (patient or doctor)
CREATE POLICY "See own appointments" ON appointments
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

-- Doctors can update their appointments
CREATE POLICY "Doctors update appointments" ON appointments
  FOR UPDATE TO authenticated
  USING (doctor_id = auth.uid());

-- ─── ADMIN ROLES TABLE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor', -- 'super_admin' or 'vendedor'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_admin_roles_email ON admin_roles(email);
CREATE INDEX IF NOT EXISTS idx_admin_roles_role ON admin_roles(role);
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manages roles" ON admin_roles;
CREATE POLICY "Admin manages roles" ON admin_roles FOR ALL USING (true);

-- ─── SESSION TRACKING (for multi-session packages) ──────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS package_id UUID;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS session_number INT;

CREATE TABLE IF NOT EXISTS patient_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id),
  plan_name TEXT NOT NULL,
  total_sessions INT NOT NULL DEFAULT 1,
  used_sessions INT NOT NULL DEFAULT 0,
  price_usd NUMERIC NOT NULL,
  status TEXT DEFAULT 'active', -- active, completed, expired
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patient_packages_doctor ON patient_packages(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patient_packages_patient ON patient_packages(patient_id);
ALTER TABLE patient_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Package access" ON patient_packages;
CREATE POLICY "Package access" ON patient_packages
  FOR ALL TO authenticated USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

-- Allow insert for authenticated users (booking flow creates packages)
DROP POLICY IF EXISTS "Insert packages" ON patient_packages;
CREATE POLICY "Insert packages" ON patient_packages
  FOR INSERT TO authenticated WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- FIN v9. Deberías ver "Success. No rows returned".
-- ═══════════════════════════════════════════════════════════════
