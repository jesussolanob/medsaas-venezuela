-- =============================================================================
-- PASO 1 — BACKUP + DIAGNÓSTICO
-- 👉 Pega este archivo COMPLETO en el SQL Editor de Supabase y ejecuta.
-- 👉 Cero riesgo. Sólo crea snapshots y devuelve queries de diagnóstico.
-- 👉 Cuando termine, pégame el output de las secciones 1 a 12 y validamos.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 0 — BACKUP (no destructivo, copia todo a schema "backup_20260420")
-- ──────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS backup_20260420;

CREATE TABLE IF NOT EXISTS backup_20260420.appointments          AS SELECT * FROM public.appointments;
CREATE TABLE IF NOT EXISTS backup_20260420.consultations         AS SELECT * FROM public.consultations;
CREATE TABLE IF NOT EXISTS backup_20260420.patient_packages      AS SELECT * FROM public.patient_packages;
CREATE TABLE IF NOT EXISTS backup_20260420.patients              AS SELECT * FROM public.patients;
CREATE TABLE IF NOT EXISTS backup_20260420.profiles              AS SELECT * FROM public.profiles;
CREATE TABLE IF NOT EXISTS backup_20260420.subscriptions         AS SELECT * FROM public.subscriptions;
CREATE TABLE IF NOT EXISTS backup_20260420.subscription_payments AS SELECT * FROM public.subscription_payments;
CREATE TABLE IF NOT EXISTS backup_20260420.ehr_records           AS SELECT * FROM public.ehr_records;
CREATE TABLE IF NOT EXISTS backup_20260420.prescriptions         AS SELECT * FROM public.prescriptions;
CREATE TABLE IF NOT EXISTS backup_20260420.billing_documents     AS SELECT * FROM public.billing_documents;
CREATE TABLE IF NOT EXISTS backup_20260420.pg_policies_snapshot  AS
  SELECT * FROM pg_policies WHERE schemaname='public';

SELECT '✅ BACKUPS CREADOS' AS status,
  (SELECT COUNT(*) FROM backup_20260420.appointments)          AS n_appointments,
  (SELECT COUNT(*) FROM backup_20260420.consultations)         AS n_consultations,
  (SELECT COUNT(*) FROM backup_20260420.subscriptions)         AS n_subscriptions,
  (SELECT COUNT(*) FROM backup_20260420.profiles)              AS n_profiles,
  (SELECT COUNT(*) FROM backup_20260420.patients)              AS n_patients,
  (SELECT COUNT(*) FROM backup_20260420.patient_packages)      AS n_packages,
  (SELECT COUNT(*) FROM backup_20260420.pg_policies_snapshot)  AS n_policies;


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 1 — Valores válidos del ENUM user_role (descubrimiento)
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  '1. ENUM user_role VALORES' AS section,
  unnest(enum_range(NULL::user_role))::text AS valid_role;


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 2 — Policies RLS duplicadas por tilde
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  '2. POLICIES DUPLICADAS' AS section,
  tablename,
  array_agg(DISTINCT policyname ORDER BY policyname) AS policy_names,
  COUNT(*) AS n
FROM pg_policies
WHERE schemaname='public'
GROUP BY tablename,
  translate(lower(policyname), 'áéíóúñÁÉÍÓÚÑ','aeiounAEIOUN')
HAVING COUNT(*) > 1
ORDER BY tablename;


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 3 — Índices duplicados
-- ──────────────────────────────────────────────────────────────────────────
WITH idx AS (
  SELECT
    t.relname AS tablename,
    i.relname AS indexname,
    array_agg(a.attname ORDER BY k.ordinality) AS cols
  FROM pg_index ix
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_class t ON t.oid = ix.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
  WHERE n.nspname='public' AND NOT ix.indisprimary
  GROUP BY t.relname, i.relname
)
SELECT
  '3. ÍNDICES DUPLICADOS' AS section,
  tablename,
  cols,
  array_agg(indexname ORDER BY indexname) AS duplicate_indexes
FROM idx
GROUP BY tablename, cols
HAVING COUNT(*) > 1
ORDER BY tablename;


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 4 — Suscripciones: ¿hay plan 'enterprise' o 'centro_salud'?
-- ──────────────────────────────────────────────────────────────────────────
SELECT '4. SUSCRIPCIONES POR PLAN' AS section,
  plan, status, COUNT(*) AS n
FROM subscriptions
GROUP BY plan, status
ORDER BY plan, status;

SELECT '4b. DOCTORES CON >1 SUSCRIPCIÓN' AS section,
  doctor_id, COUNT(*) AS n, array_agg(plan) AS plans
FROM subscriptions
GROUP BY doctor_id
HAVING COUNT(*) > 1;


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 5 — Citas duplicadas (mismo doctor+paciente ±15 min)
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  '5. CITAS DUPLICADAS ±15min' AS section,
  a1.doctor_id,
  COALESCE(a1.patient_email, a1.patient_phone, a1.patient_name) AS patient_ref,
  a1.id AS appt1, a1.scheduled_at AS t1, a1.status::text AS s1,
  a2.id AS appt2, a2.scheduled_at AS t2, a2.status::text AS s2,
  EXTRACT(EPOCH FROM (a2.scheduled_at - a1.scheduled_at))/60 AS min_apart
FROM appointments a1
JOIN appointments a2 ON
  a1.doctor_id = a2.doctor_id
  AND a1.id < a2.id
  AND ABS(EXTRACT(EPOCH FROM (a2.scheduled_at - a1.scheduled_at))) <= 900
  AND COALESCE(a1.patient_email, a1.patient_phone, a1.patient_name) =
      COALESCE(a2.patient_email, a2.patient_phone, a2.patient_name)
WHERE a1.status::text IN ('scheduled','confirmed','completed')
  AND a2.status::text IN ('scheduled','confirmed','completed')
ORDER BY a1.doctor_id, a1.scheduled_at;


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 6 — Paquetes sobre-consumidos / inconsistentes
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  '6. PAQUETES INCONSISTENTES' AS section,
  id, doctor_id, patient_id, plan_name,
  total_sessions, used_sessions, status,
  (used_sessions - total_sessions) AS excess
FROM patient_packages
WHERE used_sessions > total_sessions
   OR (status = 'completed' AND used_sessions < total_sessions)
   OR (status = 'active' AND used_sessions >= total_sessions);


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 7 — Profiles con role NULL (caen a default 'doctor' en callback)
-- ──────────────────────────────────────────────────────────────────────────
SELECT '7. PROFILES CON ROLE NULL' AS section,
  id, email, full_name, role::text AS role, created_at
FROM profiles
WHERE role IS NULL
ORDER BY created_at DESC;

SELECT '7b. AUTH USERS SIN PROFILE' AS section,
  u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC
LIMIT 50;


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 8 — Columnas reales de ehr_records, prescriptions, billing_documents
-- (el join a consultation_id falla si la tabla se llama distinto — miremos)
-- ──────────────────────────────────────────────────────────────────────────
SELECT '8pre. ESTRUCTURA ehr_records' AS section,
  column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='ehr_records'
ORDER BY ordinal_position;

SELECT '8pre2. ESTRUCTURA prescriptions' AS section,
  column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='prescriptions'
ORDER BY ordinal_position;

SELECT '8pre3. ESTRUCTURA billing_documents' AS section,
  column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='billing_documents'
ORDER BY ordinal_position;

-- Huérfanos seguros (sólo consultations.appointment_id que no existe)
SELECT '8a. CONSULTATIONS HUÉRFANAS (appointment_id inexistente)' AS section,
  COUNT(*) AS n
FROM consultations c
LEFT JOIN appointments a ON a.id = c.appointment_id
WHERE c.appointment_id IS NOT NULL AND a.id IS NULL;

-- Huérfanos seguros (sólo appointments.package_id que no existe)
SELECT '8b. APPOINTMENTS CON PACKAGE_ID INEXISTENTE' AS section,
  COUNT(*) AS n
FROM appointments a
LEFT JOIN patient_packages p ON p.id = a.package_id
WHERE a.package_id IS NOT NULL AND p.id IS NULL;

-- ehr_records y prescriptions: los evaluamos en PASO 2 una vez que
-- veamos en 8pre/8pre2 cuál es el nombre real de la FK.


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 9 — Pacientes duplicados por (doctor_id, email)
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  '9. PACIENTES DUPLICADOS' AS section,
  doctor_id,
  LOWER(TRIM(email)) AS norm_email,
  array_agg(id ORDER BY created_at) AS patient_ids,
  COUNT(*) AS n
FROM patients
WHERE email IS NOT NULL AND email <> ''
GROUP BY doctor_id, LOWER(TRIM(email))
HAVING COUNT(*) > 1
ORDER BY n DESC;


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 10 — Tablas sin RLS habilitado
-- ──────────────────────────────────────────────────────────────────────────
SELECT '10. TABLAS SIN RLS' AS section,
  t.tablename, c.relrowsecurity AS rls_enabled
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname='public' AND NOT c.relrowsecurity
ORDER BY t.tablename;

SELECT '10b. POLICIES CON USING true (permisivas)' AS section,
  tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND qual = 'true';


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 11 — Cuentas de prueba creadas por seed endpoints
-- ──────────────────────────────────────────────────────────────────────────
SELECT '11. CUENTAS DE PRUEBA' AS section,
  u.id, u.email, u.created_at,
  p.role::text AS role,
  p.full_name
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email IN (
  'ivana@gmail.com',
  'metropolitana@gmail.com',
  'anasolanob07@gmail.com'
)
ORDER BY u.created_at DESC;


-- ──────────────────────────────────────────────────────────────────────────
-- SECCIÓN 12 — DDL aproximado de tablas que NO están versionadas en el repo
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  '12. DDL APROX' AS section,
  table_name,
  string_agg(
    column_name || ' ' || udt_name ||
    CASE WHEN is_nullable='NO' THEN ' NOT NULL' ELSE '' END ||
    CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
    ', '
    ORDER BY ordinal_position
  ) AS columns
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN (
    'subscriptions','subscription_payments','plan_configs','plan_features',
    'plan_promotions','reminders_queue','reminders_settings'
  )
GROUP BY table_name
ORDER BY table_name;

-- =============================================================================
-- FIN DEL PASO 1
-- 👉 Copia TODO el output (secciones 1 a 12) y pégamelo aquí.
-- =============================================================================
