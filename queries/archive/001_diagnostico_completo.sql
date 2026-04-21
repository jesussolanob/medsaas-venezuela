-- Diagnóstico 001 — estructura real, enums, duplicados, huérfanos
-- Modo READ ONLY (sin @allow-write). Ejecuta múltiples SELECTs.

-- A. Todos los enums y sus valores
SELECT
  'A_enums' AS section,
  t.typname AS enum_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) AS valid_values
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

-- B. UNIQUE constraints en subscriptions
SELECT
  'B_subscriptions_constraints' AS section,
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.subscriptions'::regclass;

-- C. Estructura completa de profiles
SELECT
  'C_profiles_columns' AS section,
  column_name, udt_name AS type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
ORDER BY ordinal_position;

-- D. Estructura de appointments
SELECT
  'D_appointments_columns' AS section,
  column_name, udt_name AS type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='appointments'
ORDER BY ordinal_position;

-- D2. Estructura de ehr_records y prescriptions (columnas FK reales)
SELECT
  'D2_ehr_records_columns' AS section,
  column_name, udt_name AS type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='ehr_records'
ORDER BY ordinal_position;

SELECT
  'D3_prescriptions_columns' AS section,
  column_name, udt_name AS type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='prescriptions'
ORDER BY ordinal_position;

-- E. Suscripciones por plan
SELECT 'E_subs_by_plan' AS section,
  plan::text, status::text, COUNT(*) AS n
FROM subscriptions
GROUP BY plan, status
ORDER BY plan, status;

-- E2. Doctores con múltiples suscripciones
SELECT 'E2_multi_subs' AS section,
  doctor_id, COUNT(*) AS n,
  array_agg(plan::text) AS plans,
  array_agg(status::text) AS statuses
FROM subscriptions
GROUP BY doctor_id
HAVING COUNT(*) > 1;

-- F. Profiles con role NULL
SELECT 'F_null_role' AS section,
  id, email, full_name, role::text, created_at
FROM profiles WHERE role IS NULL
ORDER BY created_at DESC;

-- G. Citas duplicadas mismo doctor+paciente ±15min
SELECT
  'G_duplicate_appts' AS section,
  a1.doctor_id,
  COALESCE(a1.patient_email, a1.patient_phone, a1.patient_name) AS patient_ref,
  a1.id AS appt1, a1.scheduled_at AS t1,
  a2.id AS appt2, a2.scheduled_at AS t2,
  (EXTRACT(EPOCH FROM (a2.scheduled_at - a1.scheduled_at))/60)::int AS min_apart
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

-- H. Paquetes inconsistentes
SELECT
  'H_inconsistent_packages' AS section,
  id, doctor_id, patient_id, plan_name,
  total_sessions, used_sessions, status::text,
  (used_sessions - total_sessions) AS excess
FROM patient_packages
WHERE used_sessions > total_sessions
   OR (status::text = 'completed' AND used_sessions < total_sessions)
   OR (status::text = 'active' AND used_sessions >= total_sessions);

-- I. Pacientes duplicados por (doctor, email)
SELECT
  'I_duplicate_patients' AS section,
  doctor_id,
  LOWER(TRIM(email)) AS norm_email,
  array_agg(id ORDER BY created_at) AS patient_ids,
  COUNT(*) AS n
FROM patients
WHERE email IS NOT NULL AND email <> ''
GROUP BY doctor_id, LOWER(TRIM(email))
HAVING COUNT(*) > 1
ORDER BY n DESC;

-- J. Policies RLS duplicadas por tilde
SELECT
  'J_duplicate_policies' AS section,
  tablename,
  array_agg(DISTINCT policyname ORDER BY policyname) AS policy_names,
  COUNT(*) AS n
FROM pg_policies
WHERE schemaname='public'
GROUP BY tablename,
  translate(lower(policyname), 'áéíóúñÁÉÍÓÚÑ','aeiounAEIOUN')
HAVING COUNT(*) > 1
ORDER BY tablename;

-- K. Índices duplicados
WITH idx AS (
  SELECT t.relname AS tablename, i.relname AS indexname,
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
  'K_duplicate_indexes' AS section,
  tablename, cols, array_agg(indexname ORDER BY indexname) AS duplicates
FROM idx GROUP BY tablename, cols
HAVING COUNT(*) > 1 ORDER BY tablename;

-- L. Tablas sin RLS
SELECT 'L_tables_no_rls' AS section, t.tablename
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname='public' AND NOT c.relrowsecurity
ORDER BY t.tablename;

-- L2. Policies permisivas (USING true)
SELECT 'L2_permissive_policies' AS section,
  tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND qual = 'true';

-- M. Cuentas seed
SELECT 'M_seed_accounts' AS section,
  u.id, u.email, u.created_at,
  p.role::text AS role, p.full_name
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email IN ('ivana@gmail.com','metropolitana@gmail.com','anasolanob07@gmail.com')
ORDER BY u.created_at DESC;

-- N. Inventario de tablas public
SELECT 'N_tables_inventory' AS section,
  tablename,
  (SELECT COUNT(*) FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.table_name=t.tablename) AS n_cols
FROM pg_tables t
WHERE schemaname='public'
ORDER BY tablename;
