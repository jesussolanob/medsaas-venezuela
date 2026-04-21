-- @allow-write
-- PASO 3 — Limpieza de policies duplicadas, índices redundantes,
-- endurecimiento de policies permisivas y borrado de cuenta huérfana.
--
-- Backup-safe: todos los DROPs tienen IF EXISTS; ninguna operación borra data.
-- La única excepción es ivana@gmail.com (0 data asociada según diagnóstico).

-- ─────────────────────────────────────────────────────────────────────────
-- 3.1 Drop policies duplicadas en appointments
-- Conservamos: "Médico ve sus citas", "Público puede crear cita",
--              "Patients see their own appointments", "Doctors update their appointments"
-- Droppeamos: las "copias" con nombre distinto pero mismo efecto
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated insert appointments"      ON appointments;
DROP POLICY IF EXISTS "Patients insert their own appointments" ON appointments;
DROP POLICY IF EXISTS "See own appointments"                    ON appointments;
DROP POLICY IF EXISTS "Doctors update appointments"             ON appointments;

-- ─────────────────────────────────────────────────────────────────────────
-- 3.2 Drop índices duplicados redundantes (mantenemos los _key auto-generados
-- por constraints UNIQUE y droppeamos los idx_ manuales que son redundantes)
-- ─────────────────────────────────────────────────────────────────────────

-- appointments.appointment_code → duplicate: idx_appointments_code
DROP INDEX IF EXISTS public.idx_appointments_code;

-- appointments.scheduled_at → duplicate: idx_appointments_scheduled
DROP INDEX IF EXISTS public.idx_appointments_scheduled;

-- billing_documents.consultation_id → mantener 'idx_billing_documents_consultation', droppear el corto
DROP INDEX IF EXISTS public.idx_billing_consultation;

-- billing_documents.created_at
DROP INDEX IF EXISTS public.idx_billing_created;

-- billing_documents.doctor_id
DROP INDEX IF EXISTS public.idx_billing_doctor;

-- consultations.consultation_code → duplicate: idx_consultations_code
DROP INDEX IF EXISTS public.idx_consultations_code;

-- doctor_schedule_config.doctor_id → duplicate: idx_schedule_config_doctor
DROP INDEX IF EXISTS public.idx_schedule_config_doctor;

-- patient_messages.patient_id → duplicate: idx_pm_patient
DROP INDEX IF EXISTS public.idx_pm_patient;

-- patients.auth_user_id → duplicate: idx_patients_auth
DROP INDEX IF EXISTS public.idx_patients_auth;

-- ─────────────────────────────────────────────────────────────────────────
-- 3.3 Endurecer policy de patient_messages (era USING true)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Open patient messages" ON patient_messages;

CREATE POLICY "Doctor y paciente ven sus mensajes" ON patient_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = patient_messages.patient_id
        AND (p.doctor_id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

CREATE POLICY "Doctor y paciente insertan sus mensajes" ON patient_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = patient_messages.patient_id
        AND (p.doctor_id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3.4 Endurecer policy de admin_roles (era USING true)
-- Solo super_admin gestiona roles.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin manages roles" ON admin_roles;

CREATE POLICY "Solo super_admin gestiona roles" ON admin_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'::user_role
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3.5 Endurecer policy de invoices (era USING true)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin manages invoices" ON invoices;

CREATE POLICY "Solo super_admin gestiona invoices" ON invoices
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'::user_role
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3.6 Limpiar cuenta huérfana ivana@gmail.com (creada por /api/seed-accounts)
-- Verificación: 0 patients, 0 appointments, 0 packages (confirmado en 002)
-- ─────────────────────────────────────────────────────────────────────────
-- Borrar desde auth.users; el FK cascade limpia profiles si existe (no existe, de hecho)
DELETE FROM auth.users WHERE email = 'ivana@gmail.com';

-- ─────────────────────────────────────────────────────────────────────────
-- Verificaciones finales
-- ─────────────────────────────────────────────────────────────────────────

-- Policies permisivas restantes (debería mostrar solo las de lectura pública legítima)
SELECT 'V1_remaining_permissive' AS section,
  tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND qual = 'true'
ORDER BY tablename;

-- Policies en appointments (debería ser ≤ 5)
SELECT 'V2_appointments_policies' AS section,
  policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND tablename='appointments'
ORDER BY cmd, policyname;

-- Policies nuevas en patient_messages
SELECT 'V3_patient_messages_policies' AS section,
  policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND tablename='patient_messages'
ORDER BY policyname;

-- Confirmar que ivana ya no existe
SELECT 'V4_ivana_gone' AS section,
  COUNT(*) AS still_there
FROM auth.users WHERE email = 'ivana@gmail.com';

-- Índices restantes en tablas afectadas
SELECT 'V5_indexes_after' AS section,
  tablename, indexname
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('appointments','billing_documents','consultations','doctor_schedule_config','patient_messages','patients')
ORDER BY tablename, indexname;
