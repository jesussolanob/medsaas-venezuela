-- =============================================
-- MIGRATION V11: Clinic Plan, Appointment Mode, Waitlist, Doctor Settings
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Add appointment_mode to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_mode text DEFAULT 'presencial';

-- 2. Add office_address and allows_online to profiles (doctor settings)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS office_address text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allows_online boolean DEFAULT true;

-- 3. Create clinics table (Centro de Salud plan)
CREATE TABLE IF NOT EXISTS clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  owner_id uuid REFERENCES auth.users(id),
  logo_url text,
  address text,
  city text,
  state text,
  country text DEFAULT 'Venezuela',
  phone text,
  email text,
  description text,
  specialty text,
  subscription_plan text DEFAULT 'centro_salud',
  subscription_status text DEFAULT 'trial',
  subscription_expires_at timestamptz,
  max_doctors int DEFAULT 10,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Add clinic_id to profiles (doctors can belong to a clinic)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS clinic_role text DEFAULT 'doctor'; -- 'admin' | 'doctor'

-- 5. Create clinic_invitations table
CREATE TABLE IF NOT EXISTS clinic_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text DEFAULT 'doctor',
  token text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 6. Create waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_name text NOT NULL,
  patient_email text,
  patient_phone text,
  auth_user_id uuid REFERENCES auth.users(id),
  preferred_dates text[], -- array of preferred date strings
  preferred_time_range text, -- 'morning' | 'afternoon' | 'any'
  plan_name text,
  notes text,
  status text DEFAULT 'waiting', -- 'waiting' | 'notified' | 'booked' | 'cancelled'
  notified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 7. Create appointment_reminders_config table
CREATE TABLE IF NOT EXISTS appointment_reminders_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reminder_type text NOT NULL, -- 'whatsapp' | 'email' | 'sms'
  hours_before int NOT NULL DEFAULT 24,
  is_active boolean DEFAULT true,
  message_template text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(doctor_id, reminder_type, hours_before)
);

-- 8. RLS policies for new tables
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_reminders_config ENABLE ROW LEVEL SECURITY;

-- Clinics: owner and clinic members can read
DROP POLICY IF EXISTS "Clinic owner full access" ON clinics;
CREATE POLICY "Clinic owner full access" ON clinics
  FOR ALL USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Clinic members can read" ON clinics;
CREATE POLICY "Clinic members can read" ON clinics
  FOR SELECT USING (
    id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND clinic_id IS NOT NULL)
  );

-- Clinic invitations: clinic owner can manage
DROP POLICY IF EXISTS "Clinic invitation owner access" ON clinic_invitations;
CREATE POLICY "Clinic invitation owner access" ON clinic_invitations
  FOR ALL USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_id = auth.uid())
  );

-- Waitlist: doctor can manage their waitlist
DROP POLICY IF EXISTS "Doctor manages waitlist" ON waitlist;
CREATE POLICY "Doctor manages waitlist" ON waitlist
  FOR ALL USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Patient can join waitlist" ON waitlist;
CREATE POLICY "Patient can join waitlist" ON waitlist
  FOR INSERT WITH CHECK (true);

-- Reminders config: doctor manages own config
DROP POLICY IF EXISTS "Doctor manages reminders config" ON appointment_reminders_config;
CREATE POLICY "Doctor manages reminders config" ON appointment_reminders_config
  FOR ALL USING (doctor_id = auth.uid());

-- 9. Insert default reminder configs for existing doctors
-- (This won't duplicate if already exists due to UNIQUE constraint)
INSERT INTO appointment_reminders_config (doctor_id, reminder_type, hours_before, is_active, message_template)
SELECT p.id, 'email', 24, true, 'Recordatorio: Tu cita es mañana a las {time} con {doctor_name}'
FROM profiles p WHERE p.role = 'doctor'
ON CONFLICT DO NOTHING;

INSERT INTO appointment_reminders_config (doctor_id, reminder_type, hours_before, is_active, message_template)
SELECT p.id, 'whatsapp', 3, true, 'Hola {patient_name}, te recordamos tu cita hoy a las {time} con {doctor_name}'
FROM profiles p WHERE p.role = 'doctor'
ON CONFLICT DO NOTHING;

-- Done!
-- New columns: appointments.appointment_mode, profiles.office_address, profiles.allows_online, profiles.clinic_id, profiles.clinic_role
-- New tables: clinics, clinic_invitations, waitlist, appointment_reminders_config
