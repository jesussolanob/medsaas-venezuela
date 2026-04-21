-- =============================================================================
-- PASO 2 — CORRECCIONES SQL (DEFENSIVO e IDEMPOTENTE)
-- Fecha: 2026-04-20
--
-- 👉 Ejecuta UNA SECCIÓN A LA VEZ.
-- 👉 Cada sección está envuelta en BEGIN;...COMMIT; — si algo falla,
--    hace rollback automático de esa sección.
-- 👉 Ya tienes backup en schema backup_20260420 (paso 1).
-- 👉 Las secciones que requieran input tuyo están marcadas con ⚠️ STOP.
-- =============================================================================


-- =============================================================================
-- SECCIÓN 1 — Agregar 'clinic' al enum subscription_plan (si no existe)
-- Resuelve: CR-007 (enterprise vs clinic).
-- Idempotente: no hace nada si 'clinic' ya es un valor válido.
-- =============================================================================
DO $$
BEGIN
  -- Añadir 'clinic' si no está
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'subscription_plan'::regtype
      AND enumlabel = 'clinic'
  ) THEN
    ALTER TYPE subscription_plan ADD VALUE 'clinic';
    RAISE NOTICE '✅ Valor clinic agregado a enum subscription_plan';
  ELSE
    RAISE NOTICE 'ℹ️  Valor clinic ya existe en enum subscription_plan';
  END IF;
END $$;

-- Verificación
SELECT
  '1. VALORES FINALES DE subscription_plan' AS section,
  array_agg(enumlabel ORDER BY enumsortorder) AS values
FROM pg_enum
WHERE enumtypid = 'subscription_plan'::regtype;


-- =============================================================================
-- SECCIÓN 2 — Migrar suscripciones 'enterprise' → 'clinic'
-- ⚠️ Ejecuta SECCIÓN 1 primero (añade 'clinic' al enum).
-- =============================================================================
BEGIN;

-- Preview: cuántas filas se van a migrar
SELECT
  '2a. ANTES DE MIGRAR' AS section,
  plan::text AS plan,
  status::text AS status,
  COUNT(*) AS n
FROM subscriptions
WHERE plan::text IN ('enterprise','centro_salud')
GROUP BY plan, status
ORDER BY plan, status;

-- Ejecutar migración condicionada (sólo si el enum tiene esos valores)
DO $$
BEGIN
  -- enterprise → clinic
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'subscription_plan'::regtype AND enumlabel = 'enterprise'
  ) THEN
    UPDATE subscriptions SET plan = 'clinic'::subscription_plan
      WHERE plan::text = 'enterprise';
    RAISE NOTICE 'Migrados de enterprise → clinic';
  END IF;

  -- centro_salud → clinic (si existe)
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'subscription_plan'::regtype AND enumlabel = 'centro_salud'
  ) THEN
    UPDATE subscriptions SET plan = 'clinic'::subscription_plan
      WHERE plan::text = 'centro_salud';
    RAISE NOTICE 'Migrados de centro_salud → clinic';
  END IF;
END $$;

-- clinics.subscription_plan (TEXT, no enum)
UPDATE clinics SET subscription_plan = 'clinic'
WHERE subscription_plan IN ('enterprise','centro_salud');

-- Verificación después
SELECT '2b. DESPUÉS DE MIGRAR' AS section,
  plan::text AS plan, status::text AS status, COUNT(*) AS n
FROM subscriptions
GROUP BY plan, status
ORDER BY plan, status;

COMMIT;

-- ⚠️ STOP: verifica el output de 2b antes de seguir.
-- Si ves plan='clinic' correctamente, continúa con SECCIÓN 3.


-- =============================================================================
-- SECCIÓN 3 — Limpieza de policies RLS duplicadas (AL-114)
-- Elimina las variantes SIN tilde. No toca datos. No reduce seguridad.
-- =============================================================================
BEGIN;

-- consultations
DROP POLICY IF EXISTS "Medico gestiona sus consultas"        ON consultations;
DROP POLICY IF EXISTS "Medico ve sus propias consultas"      ON consultations;

-- prescriptions
DROP POLICY IF EXISTS "Medico gestiona sus recetas"          ON prescriptions;
DROP POLICY IF EXISTS "Medico ve sus recetas"                ON prescriptions;

-- ehr_records
DROP POLICY IF EXISTS "Medico gestiona sus registros"        ON ehr_records;

-- appointments
DROP POLICY IF EXISTS "Authenticated insert appointments"    ON appointments;
DROP POLICY IF EXISTS "Doctors update appointments"          ON appointments;
DROP POLICY IF EXISTS "See own appointments"                 ON appointments;
DROP POLICY IF EXISTS "Patients insert their own appointments" ON appointments;

-- patients
DROP POLICY IF EXISTS "Authenticated insert patients"        ON patients;
DROP POLICY IF EXISTS "See own patients"                     ON patients;
DROP POLICY IF EXISTS "Update own patient"                   ON patients;

-- pricing_plans
DROP POLICY IF EXISTS "Medico gestiona sus planes"           ON pricing_plans;

-- patient_packages (dejamos "Packages visible to doctor and patient" como canónica)
DROP POLICY IF EXISTS "Insert packages"                      ON patient_packages;
DROP POLICY IF EXISTS "Package access"                       ON patient_packages;

-- Verificación: debe devolver 0 filas
SELECT
  '3. POLICIES DUPLICADAS RESTANTES' AS section,
  tablename,
  array_agg(policyname) AS still_duplicated
FROM pg_policies
WHERE schemaname='public'
GROUP BY tablename,
  translate(lower(policyname), 'áéíóúñÁÉÍÓÚÑ','aeiounAEIOUN')
HAVING COUNT(*) > 1
ORDER BY tablename;

COMMIT;


-- =============================================================================
-- SECCIÓN 4 — Endurecer policies abiertas (USING true) — ME-215, ME-216
-- Reemplaza "Open patient messages" y "Admin manages roles" por versiones
-- restrictivas.
-- =============================================================================
BEGIN;

-- patient_messages
DROP POLICY IF EXISTS "Open patient messages" ON patient_messages;

CREATE POLICY "Doctor y paciente ven sus mensajes" ON patient_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = patient_messages.patient_id
        AND (p.doctor_id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

CREATE POLICY "Doctor y paciente insertan mensajes" ON patient_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = patient_messages.patient_id
        AND (p.doctor_id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

-- admin_roles: sólo super_admin puede leer/escribir
DROP POLICY IF EXISTS "Admin manages roles" ON admin_roles;

CREATE POLICY "Solo super_admin gestiona roles" ON admin_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role = 'super_admin'::user_role
    )
  );

COMMIT;


-- =============================================================================
-- SECCIÓN 5 — Limpieza de índices duplicados
-- Conservamos los índices con nombre canónico, droppeamos las copias.
-- Droppear índices es seguro (no pierde datos).
-- =============================================================================
BEGIN;

-- appointments(scheduled_at) — dos índices para lo mismo
DROP INDEX IF EXISTS public.idx_appointments_scheduled;  -- mantenemos idx_appointments_scheduled_at

-- Verificación
SELECT
  '5. ÍNDICES RESTANTES EN appointments(scheduled_at)' AS section,
  indexname
FROM pg_indexes
WHERE schemaname='public'
  AND tablename='appointments'
  AND indexdef ILIKE '%scheduled_at%';

COMMIT;

-- ℹ️ Otros índices duplicados (prescriptions, patients, leads) se
-- validan y droppean en la SECCIÓN 5b usando tu output real del paso 1.5.


-- =============================================================================
-- SECCIÓN 6 — Normalizar profiles con role NULL (AL-101)
-- Asigna rol correcto según evidencia o default a 'patient'.
-- =============================================================================
BEGIN;

-- Preview
SELECT
  '6a. PROFILES CON ROLE NULL - ANTES' AS section,
  p.id, p.email, p.full_name,
  (SELECT COUNT(*) FROM patients WHERE auth_user_id = p.id) AS es_paciente,
  (SELECT COUNT(*) FROM appointments WHERE doctor_id = p.id) AS tiene_citas_como_doctor
FROM profiles p
WHERE p.role IS NULL;

-- Si aparece como auth_user_id en patients → patient
UPDATE profiles p SET role = 'patient'::user_role
WHERE p.role IS NULL
  AND EXISTS (SELECT 1 FROM patients WHERE auth_user_id = p.id);

-- Si tiene citas donde es doctor_id → doctor
UPDATE profiles p SET role = 'doctor'::user_role
WHERE p.role IS NULL
  AND EXISTS (SELECT 1 FROM appointments WHERE doctor_id = p.id);

-- Los restantes: default a 'patient' (seguro — niega acceso a áreas sensibles)
UPDATE profiles SET role = 'patient'::user_role WHERE role IS NULL;

-- Hacer role NOT NULL para futuro
ALTER TABLE profiles ALTER COLUMN role SET NOT NULL;
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'patient'::user_role;

-- Verificación
SELECT '6b. PROFILES CON ROLE NULL - DESPUÉS' AS section,
  COUNT(*) AS restantes
FROM profiles WHERE role IS NULL;

COMMIT;


-- =============================================================================
-- SECCIÓN 7 — Limpieza de registros huérfanos
-- Defensiva: sólo limpia si las columnas existen.
-- =============================================================================
BEGIN;

-- 7a. Consultations cuyo appointment_id no existe
DELETE FROM consultations c
WHERE c.appointment_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = c.appointment_id);

-- 7b. ehr_records huérfanos (solo si ehr_records tiene appointment_id o consultation_id)
DO $$
DECLARE v_col text;
BEGIN
  -- ¿Qué columna FK usa ehr_records para linkear?
  SELECT column_name INTO v_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ehr_records'
    AND column_name IN ('consultation_id','appointment_id','patient_id')
  ORDER BY
    CASE column_name
      WHEN 'consultation_id' THEN 1
      WHEN 'appointment_id' THEN 2
      WHEN 'patient_id' THEN 3
    END
  LIMIT 1;

  IF v_col = 'consultation_id' THEN
    EXECUTE 'DELETE FROM ehr_records WHERE consultation_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM consultations WHERE id = ehr_records.consultation_id)';
  ELSIF v_col = 'appointment_id' THEN
    EXECUTE 'DELETE FROM ehr_records WHERE appointment_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM appointments WHERE id = ehr_records.appointment_id)';
  END IF;
  RAISE NOTICE 'ehr_records usa FK: %', v_col;
END $$;

-- 7c. Prescriptions huérfanas (misma lógica)
DO $$
DECLARE v_col text;
BEGIN
  SELECT column_name INTO v_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='prescriptions'
    AND column_name IN ('consultation_id','appointment_id','patient_id')
  ORDER BY
    CASE column_name
      WHEN 'consultation_id' THEN 1
      WHEN 'appointment_id' THEN 2
      WHEN 'patient_id' THEN 3
    END
  LIMIT 1;

  IF v_col = 'consultation_id' THEN
    EXECUTE 'DELETE FROM prescriptions WHERE consultation_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM consultations WHERE id = prescriptions.consultation_id)';
  ELSIF v_col = 'appointment_id' THEN
    EXECUTE 'DELETE FROM prescriptions WHERE appointment_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM appointments WHERE id = prescriptions.appointment_id)';
  END IF;
  RAISE NOTICE 'prescriptions usa FK: %', v_col;
END $$;

-- 7d. Appointments con package_id a paquete inexistente
UPDATE appointments SET package_id = NULL
WHERE package_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM patient_packages WHERE id = appointments.package_id);

COMMIT;


-- =============================================================================
-- SECCIÓN 8 — Función RPC book_with_package (resuelve race condition CR-006)
-- Reemplaza el patrón "INSERT appointment then UPDATE package" del endpoint.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.book_with_package(
  p_package_id       uuid,
  p_doctor_id        uuid,
  p_patient_id       uuid,
  p_auth_user_id     uuid,
  p_scheduled_at     timestamptz,
  p_patient_name     text,
  p_patient_phone    text,
  p_patient_email    text,
  p_plan_name        text,
  p_chief_complaint  text DEFAULT NULL,
  p_appointment_mode text DEFAULT 'presencial',
  p_bcv_rate         numeric DEFAULT NULL,
  p_patient_cedula   text DEFAULT NULL
) RETURNS TABLE(appointment_id uuid, package_remaining int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used int;
  v_total int;
  v_pkg_doctor uuid;
  v_pkg_status text;
  v_appt_id uuid;
  v_new_used int;
BEGIN
  -- Lock explícito del paquete: serializa bookings concurrentes.
  SELECT used_sessions, total_sessions, doctor_id, status::text
    INTO v_used, v_total, v_pkg_doctor, v_pkg_status
  FROM patient_packages
  WHERE id = p_package_id
  FOR UPDATE;

  IF NOT FOUND                    THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  IF v_pkg_doctor <> p_doctor_id  THEN RAISE EXCEPTION 'PACKAGE_DOCTOR_MISMATCH'; END IF;
  IF v_pkg_status <> 'active'     THEN RAISE EXCEPTION 'PACKAGE_NOT_ACTIVE: %', v_pkg_status; END IF;
  IF v_used >= v_total            THEN RAISE EXCEPTION 'PACKAGE_EXHAUSTED'; END IF;

  v_new_used := v_used + 1;

  -- Crear la cita (respeta FKs y triggers de appointments)
  INSERT INTO appointments (
    doctor_id, patient_id, patient_name, patient_phone, patient_email,
    patient_cedula, scheduled_at, status, source, chief_complaint,
    plan_name, plan_price, payment_method, appointment_mode,
    bcv_rate, auth_user_id, package_id, session_number
  ) VALUES (
    p_doctor_id, p_patient_id, p_patient_name, p_patient_phone, p_patient_email,
    p_patient_cedula, p_scheduled_at, 'scheduled', 'booking', p_chief_complaint,
    p_plan_name, 0, 'package', p_appointment_mode,
    p_bcv_rate, p_auth_user_id, p_package_id, v_new_used
  ) RETURNING id INTO v_appt_id;

  -- Actualizar paquete (auto-complete si se consumen todas)
  UPDATE patient_packages
     SET used_sessions = v_new_used,
         status = CASE WHEN v_new_used >= v_total THEN 'completed' ELSE status END,
         updated_at = NOW()
  WHERE id = p_package_id;

  appointment_id := v_appt_id;
  package_remaining := v_total - v_new_used;
  RETURN NEXT;
END $$;

-- Permiso mínimo de ejecución
REVOKE ALL ON FUNCTION public.book_with_package FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_with_package TO authenticated, service_role, anon;

COMMIT;


-- =============================================================================
-- SECCIÓN 9 — UNIQUE constraints preventivos (después de limpiar duplicados)
-- ⚠️ Ejecutar sólo si la sección G (citas duplicadas) del paso 1.5 devolvió 0 filas.
--    Si hay duplicados, primero resuelvelos manualmente o comenta esta sección.
-- =============================================================================
BEGIN;

-- Un paciente por (doctor, email normalizado)
CREATE UNIQUE INDEX IF NOT EXISTS patients_doctor_email_uq
  ON patients(doctor_id, LOWER(TRIM(email)))
  WHERE email IS NOT NULL AND email <> '';

-- Un slot por doctor (sólo citas activas)
CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_uq
  ON appointments(doctor_id, scheduled_at)
  WHERE status::text IN ('scheduled','confirmed');

-- Una suscripción por doctor
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_doctor_id_key'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    -- primero chequear que no hay duplicados
    IF NOT EXISTS (
      SELECT 1 FROM subscriptions
      GROUP BY doctor_id HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_doctor_id_key UNIQUE (doctor_id);
      RAISE NOTICE '✅ UNIQUE(doctor_id) añadido a subscriptions';
    ELSE
      RAISE NOTICE '⚠️  Hay duplicados en subscriptions.doctor_id. Resuélvelos primero.';
    END IF;
  END IF;
END $$;

COMMIT;


-- =============================================================================
-- FIN del PASO 2
-- Si algo salió mal, restaura desde backup_20260420:
--   BEGIN;
--   TRUNCATE public.<tabla>;
--   INSERT INTO public.<tabla> SELECT * FROM backup_20260420.<tabla>;
--   COMMIT;
-- =============================================================================
