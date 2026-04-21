-- =============================================================================
-- PASO 1.5 — Valores de TODOS los enums + secciones que faltaron del paso 1
-- 100% solo SELECTs, cero riesgo, ejecuta entero.
-- Pégame el output de las 13 secciones.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- A. Todos los enums y sus valores
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'A. ENUMS DEFINIDOS' AS section,
  t.typname AS enum_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) AS valid_values
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;


-- ──────────────────────────────────────────────────────────────────────────
-- B. Constraints UNIQUE en subscriptions y subscription_payments
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'B. UNIQUE CONSTRAINTS subscriptions' AS section,
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
  'public.subscriptions'::regclass,
  'public.subscription_payments'::regclass
);


-- ──────────────────────────────────────────────────────────────────────────
-- C. Estructura COMPLETA de profiles (para entender role enum + columnas)
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'C. ESTRUCTURA profiles' AS section,
  column_name, udt_name AS type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
ORDER BY ordinal_position;


-- ──────────────────────────────────────────────────────────────────────────
-- D. Estructura de appointments (para confirmar status enum)
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'D. ESTRUCTURA appointments' AS section,
  column_name, udt_name AS type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='appointments'
ORDER BY ordinal_position;


-- ──────────────────────────────────────────────────────────────────────────
-- E. Suscripciones por plan (ahora que sabemos que es enum)
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'E. SUSCRIPCIONES POR PLAN' AS section,
  plan::text AS plan,
  status::text AS status,
  COUNT(*) AS n
FROM subscriptions
GROUP BY plan, status
ORDER BY plan, status;

SELECT
  'E2. DOCTORES CON >1 SUSCRIPCIÓN' AS section,
  doctor_id,
  COUNT(*) AS n,
  array_agg(plan::text) AS plans,
  array_agg(status::text) AS statuses
FROM subscriptions
GROUP BY doctor_id
HAVING COUNT(*) > 1;


-- ──────────────────────────────────────────────────────────────────────────
-- F. Profiles con role NULL
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'F. PROFILES CON ROLE NULL' AS section,
  id, email, full_name, role::text, created_at
FROM profiles
WHERE role IS NULL
ORDER BY created_at DESC;


-- ──────────────────────────────────────────────────────────────────────────
-- G. Citas duplicadas (mismo doctor + paciente ±15min)
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'G. CITAS DUPLICADAS ±15min' AS section,
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
-- H. Paquetes inconsistentes
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'H. PAQUETES INCONSISTENTES' AS section,
  id, doctor_id, patient_id, plan_name,
  total_sessions, used_sessions, status::text,
  (used_sessions - total_sessions) AS excess
FROM patient_packages
WHERE used_sessions > total_sessions
   OR (status::text = 'completed' AND used_sessions < total_sessions)
   OR (status::text = 'active' AND used_sessions >= total_sessions);


-- ──────────────────────────────────────────────────────────────────────────
-- I. Pacientes duplicados por (doctor_id, email)
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'I. PACIENTES DUPLICADOS' AS section,
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
-- J. Policies RLS duplicadas
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'J. POLICIES DUPLICADAS POR TILDE' AS section,
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
-- K. Índices duplicados
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
  'K. ÍNDICES DUPLICADOS' AS section,
  tablename, cols, array_agg(indexname ORDER BY indexname) AS duplicate_indexes
FROM idx
GROUP BY tablename, cols
HAVING COUNT(*) > 1
ORDER BY tablename;


-- ──────────────────────────────────────────────────────────────────────────
-- L. Tablas sin RLS habilitado y policies USING true
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'L. TABLAS SIN RLS' AS section,
  t.tablename
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname='public' AND NOT c.relrowsecurity
ORDER BY t.tablename;

SELECT
  'L2. POLICIES PERMISIVAS' AS section,
  tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND qual = 'true';


-- ──────────────────────────────────────────────────────────────────────────
-- M. Cuentas de prueba creadas por seed endpoints
-- ──────────────────────────────────────────────────────────────────────────
SELECT
  'M. CUENTAS DE PRUEBA' AS section,
  u.id, u.email, u.created_at,
  p.role::text AS role, p.full_name
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email IN (
  'ivana@gmail.com',
  'metropolitana@gmail.com',
  'anasolanob07@gmail.com'
)
ORDER BY u.created_at DESC;

-- =============================================================================
-- FIN — pégame el output completo de las 13 secciones (A a M).
-- =============================================================================
