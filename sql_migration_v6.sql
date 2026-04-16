-- ═══════════════════════════════════════════════════════════════
-- Migration v6 — Auth de pacientes + comprobantes + booking→agenda
-- Idempotente y defensivo.
-- ═══════════════════════════════════════════════════════════════

-- 1. Linkar patients a auth users (para que un paciente pueda tener cuenta)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS cedula VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_patients_auth_user ON patients(auth_user_id);

-- 2. Appointments: agregar columnas si no existen
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'direct';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS insurance_name TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_cedula VARCHAR(20);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- 3. Copiar appointment_date -> scheduled_at SI esa columna existe y scheduled_at está vacío
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='appointments' AND column_name='appointment_date'
  ) THEN
    UPDATE appointments SET scheduled_at = appointment_date WHERE scheduled_at IS NULL;
  END IF;
END $$;

-- 4. Default de status
ALTER TABLE appointments ALTER COLUMN status SET DEFAULT 'scheduled';

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_appointments_auth_user ON appointments(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- 6. RLS: paciente ve sus propias citas; doctor ve las de su consulta
DROP POLICY IF EXISTS "Patients see their own appointments" ON appointments;
CREATE POLICY "Patients see their own appointments" ON appointments
  FOR SELECT USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

DROP POLICY IF EXISTS "Patients insert their own appointments" ON appointments;
CREATE POLICY "Patients insert their own appointments" ON appointments
  FOR INSERT WITH CHECK (auth_user_id = auth.uid() OR doctor_id = auth.uid());

DROP POLICY IF EXISTS "Doctors update their appointments" ON appointments;
CREATE POLICY "Doctors update their appointments" ON appointments
  FOR UPDATE USING (doctor_id = auth.uid());

-- 7. patients RLS: médico ve las suyas; paciente ve solo el row que le corresponde
DROP POLICY IF EXISTS "Patient sees own row" ON patients;
CREATE POLICY "Patient sees own row" ON patients
  FOR SELECT USING (auth_user_id = auth.uid() OR doctor_id = auth.uid());

DROP POLICY IF EXISTS "Patient inserts own row" ON patients;
CREATE POLICY "Patient inserts own row" ON patients
  FOR INSERT WITH CHECK (auth_user_id = auth.uid() OR doctor_id = auth.uid());

-- 8. Bucket de comprobantes de pago (Storage)
-- Correr esto manualmente en Supabase Dashboard > Storage si el bucket no existe:
-- Name: payment-receipts
-- Public: true
-- O vía SQL (requiere ejecución de policy adicional):
-- SELECT storage.create_bucket('payment-receipts', public => true);
