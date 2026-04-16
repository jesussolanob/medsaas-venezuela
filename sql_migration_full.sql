-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN COMPLETA: v9 + v10 + v11
-- Pega TODO este código en Supabase → SQL Editor → Run
-- Es idempotente: puedes correrlo varias veces sin problema
-- ═══════════════════════════════════════════════════════════════


-- ═════════════════════════════════
-- PARTE 1: RLS para booking (v9)
-- ═════════════════════════════════

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- PATIENTS
DROP POLICY IF EXISTS "Patient inserts own row" ON patients;
DROP POLICY IF EXISTS "Patient sees own row" ON patients;
DROP POLICY IF EXISTS "Patient updates own row" ON patients;
DROP POLICY IF EXISTS "Authenticated insert patients" ON patients;
DROP POLICY IF EXISTS "See own patients" ON patients;
DROP POLICY IF EXISTS "Update own patient" ON patients;

CREATE POLICY "Authenticated insert patients" ON patients
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "See own patients" ON patients
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

CREATE POLICY "Update own patient" ON patients
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

-- APPOINTMENTS
DROP POLICY IF EXISTS "Patients see their own appointments" ON appointments;
DROP POLICY IF EXISTS "Patients insert their own appointments" ON appointments;
DROP POLICY IF EXISTS "Doctors update their appointments" ON appointments;
DROP POLICY IF EXISTS "Authenticated insert appointments" ON appointments;
DROP POLICY IF EXISTS "See own appointments" ON appointments;
DROP POLICY IF EXISTS "Doctors update appointments" ON appointments;

CREATE POLICY "Authenticated insert appointments" ON appointments
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "See own appointments" ON appointments
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

CREATE POLICY "Doctors update appointments" ON appointments
  FOR UPDATE TO authenticated
  USING (doctor_id = auth.uid());


-- ═════════════════════════════════
-- PARTE 2: Admin Roles (v9)
-- ═════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_admin_roles_email ON admin_roles(email);
CREATE INDEX IF NOT EXISTS idx_admin_roles_role ON admin_roles(role);
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manages roles" ON admin_roles;
CREATE POLICY "Admin manages roles" ON admin_roles FOR ALL USING (true);


-- ═════════════════════════════════
-- PARTE 3: Paquetes de sesiones (v9)
-- ═════════════════════════════════

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
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patient_packages_doctor ON patient_packages(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patient_packages_patient ON patient_packages(patient_id);
ALTER TABLE patient_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Package access" ON patient_packages;
CREATE POLICY "Package access" ON patient_packages
  FOR ALL TO authenticated USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());
DROP POLICY IF EXISTS "Insert packages" ON patient_packages;
CREATE POLICY "Insert packages" ON patient_packages
  FOR INSERT TO authenticated WITH CHECK (true);


-- ═════════════════════════════════
-- PARTE 4: Ubicación del doctor (v10)
-- ═════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Venezuela';


-- ═════════════════════════════════
-- PARTE 5: Modalidad de cita (v11)
-- ═════════════════════════════════

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_mode TEXT DEFAULT 'presencial';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS office_address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allows_online BOOLEAN DEFAULT true;


-- ═════════════════════════════════
-- PARTE 6: Clínicas - Centro de Salud (v11)
-- ═════════════════════════════════

CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  owner_id UUID REFERENCES auth.users(id),
  logo_url TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Venezuela',
  phone TEXT,
  email TEXT,
  description TEXT,
  specialty TEXT,
  subscription_plan TEXT DEFAULT 'centro_salud',
  subscription_status TEXT DEFAULT 'trial',
  subscription_expires_at TIMESTAMPTZ,
  max_doctors INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS clinic_role TEXT DEFAULT 'doctor';


-- ═════════════════════════════════
-- PARTE 7: Invitaciones de clínica (v11)
-- ═════════════════════════════════

CREATE TABLE IF NOT EXISTS clinic_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'doctor',
  token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT DEFAULT 'pending',
  invited_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ═════════════════════════════════
-- PARTE 8: Lista de espera (v11)
-- ═════════════════════════════════

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  patient_email TEXT,
  patient_phone TEXT,
  auth_user_id UUID REFERENCES auth.users(id),
  preferred_dates TEXT[],
  preferred_time_range TEXT,
  plan_name TEXT,
  notes TEXT,
  status TEXT DEFAULT 'waiting',
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ═════════════════════════════════
-- PARTE 9: Config de recordatorios (v11)
-- ═════════════════════════════════

CREATE TABLE IF NOT EXISTS appointment_reminders_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  hours_before INT NOT NULL DEFAULT 24,
  is_active BOOLEAN DEFAULT true,
  message_template TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, reminder_type, hours_before)
);


-- ═════════════════════════════════
-- PARTE 10: RLS para tablas nuevas (v11)
-- ═════════════════════════════════

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_reminders_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic owner full access" ON clinics;
CREATE POLICY "Clinic owner full access" ON clinics
  FOR ALL USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Clinic members can read" ON clinics;
CREATE POLICY "Clinic members can read" ON clinics
  FOR SELECT USING (
    id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid() AND clinic_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "Clinic invitation owner access" ON clinic_invitations;
CREATE POLICY "Clinic invitation owner access" ON clinic_invitations
  FOR ALL USING (
    clinic_id IN (SELECT id FROM clinics WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Doctor manages waitlist" ON waitlist;
CREATE POLICY "Doctor manages waitlist" ON waitlist
  FOR ALL USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Patient can join waitlist" ON waitlist;
CREATE POLICY "Patient can join waitlist" ON waitlist
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Doctor manages reminders config" ON appointment_reminders_config;
CREATE POLICY "Doctor manages reminders config" ON appointment_reminders_config
  FOR ALL USING (doctor_id = auth.uid());


-- ═════════════════════════════════
-- PARTE 11: Recordatorios por defecto para doctores existentes
-- ═════════════════════════════════

INSERT INTO appointment_reminders_config (doctor_id, reminder_type, hours_before, is_active, message_template)
SELECT p.id, 'email', 24, true, 'Recordatorio: Tu cita es mañana a las {time} con {doctor_name}'
FROM profiles p WHERE p.role = 'doctor'
ON CONFLICT DO NOTHING;

INSERT INTO appointment_reminders_config (doctor_id, reminder_type, hours_before, is_active, message_template)
SELECT p.id, 'whatsapp', 3, true, 'Hola {patient_name}, te recordamos tu cita hoy a las {time} con {doctor_name}'
FROM profiles p WHERE p.role = 'doctor'
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- LISTO! Deberías ver "Success. No rows returned"
--
-- Resumen de lo que se creó:
-- Columnas en appointments: package_id, session_number, appointment_mode
-- Columnas en profiles: state, city, country, office_address, allows_online, clinic_id, clinic_role
-- Tablas nuevas: admin_roles, patient_packages, clinics, clinic_invitations, waitlist, appointment_reminders_config
-- Políticas RLS para todas las tablas
-- ═══════════════════════════════════════════════════════════════
