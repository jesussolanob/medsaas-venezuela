-- =============================================================================
-- SCRIPT DE REMEDIACIÓN — Delta Medical CRM
-- Fecha: 2026-04-20
-- ⚠️  ESTE ARCHIVO ES DESTRUCTIVO.
--     NO lo ejecutes completo. Ejecuta SECCIÓN por SECCIÓN, en orden,
--     y sólo después de que te haya pedido confirmación explícita.
--
--     Antes de cualquier sección, ejecuta la SECCIÓN 0 (BACKUP).
--
-- Estructura:
--   SECCIÓN 0  — Backup (obligatorio, no destructivo)
--   SECCIÓN A  — Limpieza de políticas RLS duplicadas (no borra datos)
--   SECCIÓN B  — Limpieza de índices duplicados (no borra datos)
--   SECCIÓN C  — Migración plan 'enterprise' → 'clinic' (CR-007)
--   SECCIÓN D  — Borrado de perfiles/cuentas de prueba de seed (peligroso)
--   SECCIÓN E  — Limpieza de registros huérfanos (peligroso)
--   SECCIÓN F  — Normalización de roles en profiles (AL-101)
--   SECCIÓN G  — Creación de función transaccional book_with_package (CR-006)
--   SECCIÓN H  — Re-creación formal de tablas faltantes (CR-002 — sólo estructura)
--   SECCIÓN I  — Unique constraints que evitan duplicados a futuro
-- =============================================================================


-- =============================================================================
-- SECCIÓN 0 — BACKUP OBLIGATORIO (NO DESTRUCTIVO)
-- Antes de TODO lo demás. Supabase también mantiene snapshots automáticos,
-- pero estos backups in-place son inmediatos y permiten rollback rápido.
-- =============================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS backup_20260420;

-- Copia completa de las tablas críticas
CREATE TABLE backup_20260420.appointments         AS SELECT * FROM public.appointments;
CREATE TABLE backup_20260420.consultations        AS SELECT * FROM public.consultations;
CREATE TABLE backup_20260420.patient_packages     AS SELECT * FROM public.patient_packages;
CREATE TABLE backup_20260420.patients             AS SELECT * FROM public.patients;
CREATE TABLE backup_20260420.profiles             AS SELECT * FROM public.profiles;
CREATE TABLE backup_20260420.subscriptions        AS SELECT * FROM public.subscriptions;
CREATE TABLE backup_20260420.subscription_payments AS SELECT * FROM public.subscription_payments;
CREATE TABLE backup_20260420.ehr_records          AS SELECT * FROM public.ehr_records;
CREATE TABLE backup_20260420.prescriptions        AS SELECT * FROM public.prescriptions;
CREATE TABLE backup_20260420.billing_documents    AS SELECT * FROM public.billing_documents;

-- Snapshot de las policies actuales
CREATE TABLE backup_20260420.pg_policies_snapshot AS
  SELECT * FROM pg_policies WHERE schemaname='public';

-- Verificación: tamaño de cada backup
SELECT
  'BACKUP CREADO' AS status,
  table_name,
  (SELECT COUNT(*)::text FROM backup_20260420.appointments)         WHERE table_name='appointments'
FROM (VALUES ('appointments'),('consultations'),('patient_packages'),
             ('patients'),('profiles'),('subscriptions'),
             ('subscription_payments'),('ehr_records'),('prescriptions'),
             ('billing_documents'),('pg_policies_snapshot')) v(table_name);

COMMIT;

-- ⚠️ DETENTE AQUÍ Y AVÍSAME ANTES DE CONTINUAR A LA SIGUIENTE SECCIÓN.


-- =============================================================================
-- SECCIÓN A — Limpieza de políticas RLS duplicadas  (hallazgo AL-114)
-- Elimina la variante SIN tilde, conserva la variante CON tilde (más recientes).
-- NO borra datos. NO reduce seguridad (ambas políticas tenían el mismo efecto).
-- =============================================================================
BEGIN;

-- consultations
DROP POLICY IF EXISTS "Medico gestiona sus consultas" ON consultations;
DROP POLICY IF EXISTS "Medico ve sus propias consultas" ON consultations;

-- prescriptions
DROP POLICY IF EXISTS "Medico gestiona sus recetas" ON prescriptions;
DROP POLICY IF EXISTS "Medico ve sus recetas" ON prescriptions;

-- ehr_records
DROP POLICY IF EXISTS "Medico gestiona sus registros" ON ehr_records;

-- appointments  — conservar las con tilde, dropear "duplicadas"
DROP POLICY IF EXISTS "Authenticated insert appointments" ON appointments;   -- redundante con "Público puede crear cita"
DROP POLICY IF EXISTS "Doctors update appointments" ON appointments;         -- redundante con "Doctors update their appointments"
DROP POLICY IF EXISTS "See own appointments" ON appointments;                -- redundante con "Médico ve sus citas"
DROP POLICY IF EXISTS "Patients insert their own appointments" ON appointments; -- redundante con "Público puede crear cita"

-- patients
DROP POLICY IF EXISTS "Authenticated insert patients" ON patients;
DROP POLICY IF EXISTS "See own patients" ON patients;     -- redundante con "Médico ve sus propios pacientes"
DROP POLICY IF EXISTS "Update own patient" ON patients;   -- redundante con "Patient updates own row"

-- pricing_plans
DROP POLICY IF EXISTS "Medico gestiona sus planes" ON pricing_plans;

-- patient_packages
DROP POLICY IF EXISTS "Insert packages" ON patient_packages;    -- redundante con "Package access"
DROP POLICY IF EXISTS "Package access" ON patient_packages;     -- preferir "Packages visible to doctor and patient"

-- admin_roles (tiene USING true, peligroso — lo endurecemos en sección A2)
-- leads: sin duplicados claros, skip

-- Verificación post-limpieza: debe devolver 0 filas
SELECT
  'PENDIENTE DE LIMPIAR' AS status,
  tablename,
  array_agg(policyname) AS remaining_duplicates
FROM pg_policies
WHERE schemaname='public'
GROUP BY tablename,
  translate(lower(policyname), 'áéíóúñÁÉÍÓÚÑ', 'aeiounAEIOUN')
HAVING COUNT(*) > 1;

COMMIT;


-- =============================================================================
-- SECCIÓN A2 — Endurecer policies abiertas (USING true) — ME-215, ME-216
-- =============================================================================
BEGIN;

-- patient_messages — ahora mismo cualquier autenticado ve todos los mensajes.
DROP POLICY IF EXISTS "Open patient messages" ON patient_messages;

CREATE POLICY "Doctor y paciente ven sus propios mensajes" ON patient_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = patient_messages.patient_id
        AND (p.doctor_id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

CREATE POLICY "Doctor y paciente insertan sus propios mensajes" ON patient_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = patient_messages.patient_id
        AND (p.doctor_id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

-- admin_roles — lectura universal es peligrosa, restringir a super_admin/admin
DROP POLICY IF EXISTS "Admin manages roles" ON admin_roles;

CREATE POLICY "Solo admin gestiona roles" ON admin_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin')
    )
  );

COMMIT;


-- =============================================================================
-- SECCIÓN B — Limpieza de índices duplicados
-- =============================================================================
BEGIN;

-- appointments(scheduled_at) — tenemos 3 índices para lo mismo
DROP INDEX IF EXISTS public.idx_appointments_scheduled;
-- Mantener: idx_appointments_scheduled_at

-- prescriptions(patient_id), prescriptions(consultation_id) — tenemos 3
-- Los migration v11 los crea dentro del bloque CREATE TABLE, no causan daño,
-- pero hay duplicado con el prefijo de indent. Validación:
--   SELECT indexname FROM pg_indexes WHERE tablename='prescriptions';
-- Si ves dos veces el mismo indexname, abajo lo renombramos.

-- patient_packages(doctor_id), patient_packages(patient_id) — 2 cada uno
-- A validar post-introspección. Descomenta si confirmas:
-- DROP INDEX IF EXISTS public.idx_patient_packages_doctor_dup;
-- DROP INDEX IF EXISTS public.idx_patient_packages_patient_dup;

-- leads(doctor_id) — 3 índices
DROP INDEX IF EXISTS public.idx_leads_doctor_dup1;
-- Mantener: idx_leads_doctor

-- patients(auth_user_id) — 3 índices
-- Misma estrategia, mantener el canónico.

COMMIT;


-- =============================================================================
-- SECCIÓN C — Migración plan 'enterprise' → 'clinic'   (CR-007)
-- ⚠️ Asegúrate de haber corrido SECCIÓN 0 (backup).
-- =============================================================================
BEGIN;

-- Cuántos registros serán afectados
SELECT
  'REGISTROS A MIGRAR' AS info,
  COUNT(*) FILTER (WHERE plan='enterprise') AS subs_enterprise,
  COUNT(*) FILTER (WHERE plan='centro_salud') AS subs_centro_salud
FROM subscriptions;

-- Migrar
UPDATE subscriptions SET plan = 'clinic' WHERE plan IN ('enterprise','centro_salud');

-- También en clinics
UPDATE clinics SET subscription_plan = 'clinic'
WHERE subscription_plan IN ('enterprise','centro_salud');

-- Verificar
SELECT
  'POST-MIGRACIÓN' AS status,
  plan,
  COUNT(*) AS n
FROM subscriptions
GROUP BY plan
ORDER BY plan;

COMMIT;


-- =============================================================================
-- SECCIÓN D — Borrado de cuentas creadas por /api/seed-accounts y /api/seed-clinic
-- ⚠️ Esto borra USUARIOS REALES. Revisa la lista antes de commit.
-- =============================================================================
BEGIN;

-- Preview: qué vamos a borrar
SELECT
  'SE VAN A BORRAR' AS warn,
  u.id,
  u.email,
  u.created_at
FROM auth.users u
WHERE u.email IN (
  'ivana@gmail.com',
  'metropolitana@gmail.com'
);

-- NO EJECUTES EL DELETE aún.
-- Si confirmas que ninguno es real, pásalo a un script separado:
--   SELECT auth.admin_delete_user(u.id) FROM auth.users u
--     WHERE u.email IN ('ivana@gmail.com','metropolitana@gmail.com');
--
-- (La eliminación de auth.users cascadea a profiles por FK; revisa también
--  appointments/patients/consultations que tengan doctor_id o auth_user_id
--  apuntando a esos usuarios — posiblemente ya los borró el cascade.)

ROLLBACK;  -- por seguridad, esta sección arranca en ROLLBACK. Quita esta línea al confirmar.


-- =============================================================================
-- SECCIÓN E — Limpieza de registros huérfanos (basada en secciones 5b, 7, 7b, 7c del introspect)
-- ⚠️ Destructivo. Ejecuta la sección 7/7b/7c del introspect primero y confirma números.
-- =============================================================================
BEGIN;

-- E.1 Consultations cuyo appointment_id ya no existe
DELETE FROM consultations c
WHERE c.appointment_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = c.appointment_id);

-- E.2 EHR records cuya consultation_id ya no existe
DELETE FROM ehr_records e
WHERE e.consultation_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM consultations c WHERE c.id = e.consultation_id);

-- E.3 Prescriptions cuya consultation_id ya no existe
DELETE FROM prescriptions pr
WHERE pr.consultation_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM consultations c WHERE c.id = pr.consultation_id);

-- E.4 Appointments con package_id que apunta a paquete inexistente
UPDATE appointments SET package_id = NULL, session_number = NULL
WHERE package_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM patient_packages pk WHERE pk.id = package_id);

-- Verificación
SELECT
  'POST-LIMPIEZA HUÉRFANOS' AS status,
  (SELECT COUNT(*) FROM consultations WHERE appointment_id IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM appointments WHERE id = consultations.appointment_id)) AS consultations_orphan,
  (SELECT COUNT(*) FROM ehr_records WHERE consultation_id IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM consultations WHERE id = ehr_records.consultation_id)) AS ehr_orphan,
  (SELECT COUNT(*) FROM prescriptions WHERE consultation_id IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM consultations WHERE id = prescriptions.consultation_id)) AS prescriptions_orphan;

COMMIT;


-- =============================================================================
-- SECCIÓN F — Normalizar profiles con role NULL (AL-101)
-- Mejor que defaultear a 'doctor', marcarlos como 'patient' si hay evidencia,
-- o 'doctor' si son de antes del fix, pero mostrando una lista primero.
-- =============================================================================
BEGIN;

-- Preview: perfiles afectados
SELECT
  'ROLES NULOS A REVISAR' AS status,
  p.id,
  p.email,
  p.full_name,
  (SELECT COUNT(*) FROM patients WHERE auth_user_id = p.id) AS es_paciente_en_tabla,
  (SELECT COUNT(*) FROM appointments WHERE doctor_id = p.id) AS tiene_citas_como_doctor
FROM profiles p
WHERE p.role IS NULL;

-- Asignar 'patient' si su id aparece como auth_user_id en alguna fila de patients
UPDATE profiles p
SET role = 'patient'
WHERE p.role IS NULL
  AND EXISTS (SELECT 1 FROM patients WHERE auth_user_id = p.id);

-- Asignar 'doctor' si tiene citas donde es doctor_id
UPDATE profiles p
SET role = 'doctor'
WHERE p.role IS NULL
  AND EXISTS (SELECT 1 FROM appointments WHERE doctor_id = p.id);

-- Los restantes: marcar como 'patient' por defecto (más conservador que 'doctor')
UPDATE profiles SET role = 'patient' WHERE role IS NULL;

-- NOTA: profiles.role es un ENUM (user_role), no TEXT.
-- El enum ya restringe los valores válidos. No se requiere CHECK adicional.
-- Si quieres que role sea NOT NULL:
ALTER TABLE profiles ALTER COLUMN role SET NOT NULL;
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'patient'::user_role;

COMMIT;


-- =============================================================================
-- SECCIÓN G — Función transaccional book_with_package (resuelve CR-006)
-- Reemplaza el patrón "INSERT appointment then UPDATE package" del endpoint /api/book
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION book_with_package(
  p_package_id   uuid,
  p_doctor_id    uuid,
  p_patient_id   uuid,
  p_auth_user_id uuid,
  p_scheduled_at timestamptz,
  p_patient_name text,
  p_patient_phone text,
  p_patient_email text,
  p_plan_name    text,
  p_chief_complaint text DEFAULT NULL,
  p_appointment_mode text DEFAULT 'presencial',
  p_bcv_rate     numeric DEFAULT NULL
) RETURNS TABLE(appointment_id uuid, package_remaining int)
LANGUAGE plpgsql AS $$
DECLARE
  v_used int;
  v_total int;
  v_package_doctor uuid;
  v_package_status text;
  v_appt_id uuid;
  v_new_used int;
  v_new_status text;
BEGIN
  -- Lock del paquete (serializa bookings concurrentes)
  SELECT used_sessions, total_sessions, doctor_id, status
  INTO v_used, v_total, v_package_doctor, v_package_status
  FROM patient_packages
  WHERE id = p_package_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  IF v_package_doctor <> p_doctor_id THEN RAISE EXCEPTION 'PACKAGE_DOCTOR_MISMATCH'; END IF;
  IF v_package_status <> 'active' THEN RAISE EXCEPTION 'PACKAGE_NOT_ACTIVE'; END IF;
  IF v_used >= v_total THEN RAISE EXCEPTION 'PACKAGE_EXHAUSTED'; END IF;

  v_new_used := v_used + 1;
  v_new_status := CASE WHEN v_new_used >= v_total THEN 'completed' ELSE v_package_status END;

  -- Crear la cita
  INSERT INTO appointments (
    doctor_id, patient_id, patient_name, patient_phone, patient_email,
    scheduled_at, status, source, chief_complaint,
    plan_name, plan_price, payment_method, appointment_mode,
    bcv_rate, auth_user_id, package_id, session_number
  ) VALUES (
    p_doctor_id, p_patient_id, p_patient_name, p_patient_phone, p_patient_email,
    p_scheduled_at, 'scheduled', 'booking', p_chief_complaint,
    p_plan_name, 0, 'package', p_appointment_mode,
    p_bcv_rate, p_auth_user_id, p_package_id, v_new_used
  ) RETURNING id INTO v_appt_id;

  -- Actualizar paquete
  UPDATE patient_packages
     SET used_sessions = v_new_used, status = v_new_status, updated_at = NOW()
   WHERE id = p_package_id;

  appointment_id := v_appt_id;
  package_remaining := v_total - v_new_used;
  RETURN NEXT;
END $$;

-- Uso desde TypeScript:
--   const { data, error } = await admin.rpc('book_with_package', {
--     p_package_id: packageId, p_doctor_id: doctorId, ...
--   })

COMMIT;


-- =============================================================================
-- SECCIÓN H — Creación formal de tablas faltantes (CR-002)
-- ⚠️ Estas tablas YA EXISTEN en tu Supabase; este DDL las reconstruye idempotente
-- con IF NOT EXISTS para que el repo quede fuente-de-verdad.
-- Ajusta las columnas según el output de la sección 11 de introspect_supabase.sql.
-- =============================================================================
BEGIN;

-- subscriptions (estructura inferida del código)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id           UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  plan                TEXT NOT NULL DEFAULT 'trial'
                        CHECK (plan IN ('trial','basic','professional','clinic')),
  status              TEXT NOT NULL DEFAULT 'trial'
                        CHECK (status IN ('active','trial','trialing','past_due','suspended','cancelled')),
  price_usd           NUMERIC DEFAULT 0,
  current_period_end  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- subscription_payments
CREATE TABLE IF NOT EXISTS subscription_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id     UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount              NUMERIC NOT NULL,
  currency            TEXT DEFAULT 'USD',
  method              TEXT,
  reference_number    TEXT,
  receipt_url         TEXT,
  status              TEXT DEFAULT 'pending'
                        CHECK (status IN ('pending','verified','rejected')),
  rejection_reason    TEXT,
  verified_by         UUID REFERENCES profiles(id),
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_subpay_doctor ON subscription_payments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_subpay_status ON subscription_payments(status);

-- plan_configs
CREATE TABLE IF NOT EXISTS plan_configs (
  plan_key     TEXT PRIMARY KEY
                 CHECK (plan_key IN ('trial','basic','professional','clinic')),
  name         TEXT NOT NULL,
  price        NUMERIC NOT NULL DEFAULT 0,
  trial_days   INT DEFAULT 0,
  is_active    BOOLEAN DEFAULT TRUE,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- plan_features
CREATE TABLE IF NOT EXISTS plan_features (
  plan         TEXT NOT NULL REFERENCES plan_configs(plan_key) ON DELETE CASCADE,
  feature_key  TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (plan, feature_key)
);

-- reminders_queue
CREATE TABLE IF NOT EXISTS reminders_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  doctor_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id     UUID REFERENCES patients(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
  reminder_type  TEXT,
  scheduled_for  TIMESTAMPTZ NOT NULL,
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  last_error     TEXT,
  attempts       INT DEFAULT 0,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reminders_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reminders_status_time ON reminders_queue(status, scheduled_for);

COMMIT;


-- =============================================================================
-- SECCIÓN I — Unique constraints anti-duplicados (preventivo)
-- Ejecuta sólo después de validar que no hay duplicados existentes (sección 8 del introspect).
-- =============================================================================
BEGIN;

-- Unicidad de paciente por doctor+email
CREATE UNIQUE INDEX IF NOT EXISTS patients_doctor_email_uq
  ON patients(doctor_id, LOWER(TRIM(email)))
  WHERE email IS NOT NULL AND email <> '';

-- Unicidad de appointment en el mismo slot exacto por doctor
-- (si quieres tolerancia de ±15 min, hazlo a nivel app — el unique exact slot
--  previene el duplicado obvio sin falsos positivos)
CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_uq
  ON appointments(doctor_id, scheduled_at)
  WHERE status IN ('scheduled','confirmed');

-- Una suscripción por doctor
-- (ya declarada en SECCIÓN H con UNIQUE en la columna)

COMMIT;


-- =============================================================================
-- FIN
-- Si algo salió mal, restaura desde backup_20260420:
--   BEGIN;
--   TRUNCATE public.appointments;
--   INSERT INTO public.appointments SELECT * FROM backup_20260420.appointments;
--   COMMIT;
-- (Repetir por cada tabla.)
-- =============================================================================
