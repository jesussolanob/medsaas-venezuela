-- =============================================================================
-- INTROSPECCIÓN DE SUPABASE — Delta Medical CRM
-- Fecha: 2026-04-20
-- Uso:   Pega este archivo COMPLETO en el SQL Editor de Supabase y ejecuta.
--        Cada sección devuelve un resultset; revísalos uno por uno.
-- Acción: Copia los resultados (o screenshots) y envíamelos para validar
--         los hallazgos de la auditoría en vivo.
-- =============================================================================

-- =============================================================================
-- SECCIÓN 0 — Inventario global (qué tablas existen realmente)
-- =============================================================================
SELECT
  '0. TABLAS EN public' AS section,
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.table_name=t.table_name) AS n_columns
FROM information_schema.tables t
WHERE table_schema='public' AND table_type='BASE TABLE'
ORDER BY table_name;

-- =============================================================================
-- SECCIÓN 1 — Políticas RLS duplicadas (mismo efecto, nombre distinto)
-- Hallazgo CR/AL-114: 25 pares "Medico" vs "Médico" conviven.
-- =============================================================================
SELECT
  '1. POLICIES DUPLICADAS POR NORMALIZACIÓN' AS section,
  tablename,
  array_agg(DISTINCT policyname ORDER BY policyname) AS policy_names,
  COUNT(*) AS n
FROM pg_policies
WHERE schemaname='public'
GROUP BY tablename,
  translate(lower(policyname),
    'áéíóúñÁÉÍÓÚÑ','aeiounAEIOUN')
HAVING COUNT(*) > 1
ORDER BY tablename;

-- Conteo total de policies por tabla (para ver si alguna tiene exceso)
SELECT
  '1b. TOTAL POLICIES POR TABLA' AS section,
  tablename,
  COUNT(*) AS n_policies
FROM pg_policies
WHERE schemaname='public'
GROUP BY tablename
ORDER BY n_policies DESC, tablename;

-- =============================================================================
-- SECCIÓN 2 — Índices duplicados (mismas columnas en misma tabla)
-- =============================================================================
WITH idx AS (
  SELECT
    t.relname AS tablename,
    i.relname AS indexname,
    array_agg(a.attname ORDER BY k.ordinality) AS cols,
    ix.indisunique AS is_unique,
    ix.indisprimary AS is_primary
  FROM pg_index ix
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_class t ON t.oid = ix.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
  WHERE n.nspname='public' AND NOT ix.indisprimary
  GROUP BY t.relname, i.relname, ix.indisunique, ix.indisprimary
)
SELECT
  '2. INDICES DUPLICADOS' AS section,
  tablename,
  cols,
  array_agg(indexname ORDER BY indexname) AS duplicate_indexes,
  COUNT(*) AS n
FROM idx
GROUP BY tablename, cols
HAVING COUNT(*) > 1
ORDER BY tablename;

-- =============================================================================
-- SECCIÓN 3 — Suscripciones: inconsistencias entre plan 'enterprise' vs 'clinic'
-- Hallazgo CR-007
-- =============================================================================
SELECT
  '3. SUSCRIPCIONES POR PLAN' AS section,
  plan,
  status,
  COUNT(*) AS n
FROM subscriptions
GROUP BY plan, status
ORDER BY plan, status;

-- Detalle de suscripciones con plan='enterprise' (si existen, deben migrarse a 'clinic')
SELECT
  '3b. SUSCRIPCIONES ENTERPRISE (candidatas a migrar a clinic)' AS section,
  s.id,
  s.doctor_id,
  s.plan,
  s.status,
  s.current_period_end,
  p.email
FROM subscriptions s
LEFT JOIN profiles p ON p.id = s.doctor_id
WHERE s.plan = 'enterprise';

-- Doctores con múltiples subscriptions (debería ser única por doctor_id)
SELECT
  '3c. DOCTORES CON MÁS DE UNA SUSCRIPCIÓN' AS section,
  doctor_id,
  COUNT(*) AS n_subs,
  array_agg(plan) AS plans,
  array_agg(status) AS statuses
FROM subscriptions
GROUP BY doctor_id
HAVING COUNT(*) > 1;

-- =============================================================================
-- SECCIÓN 4 — Appointments duplicados (mismo doctor + mismo paciente + ±15 min)
-- =============================================================================
SELECT
  '4. APPOINTMENTS DUPLICADAS ±15min' AS section,
  a1.doctor_id,
  COALESCE(a1.patient_email, a1.patient_phone, a1.patient_name) AS patient_ref,
  a1.id AS appt1_id,
  a1.scheduled_at AS appt1_time,
  a1.status AS appt1_status,
  a2.id AS appt2_id,
  a2.scheduled_at AS appt2_time,
  a2.status AS appt2_status,
  EXTRACT(EPOCH FROM (a2.scheduled_at - a1.scheduled_at))/60 AS minutes_apart
FROM appointments a1
JOIN appointments a2 ON
  a1.doctor_id = a2.doctor_id
  AND a1.id < a2.id
  AND ABS(EXTRACT(EPOCH FROM (a2.scheduled_at - a1.scheduled_at))) <= 900  -- 15 min
  AND COALESCE(a1.patient_email, a1.patient_phone, a1.patient_name) =
      COALESCE(a2.patient_email, a2.patient_phone, a2.patient_name)
WHERE a1.status IN ('scheduled','confirmed','completed')
  AND a2.status IN ('scheduled','confirmed','completed')
ORDER BY a1.doctor_id, a1.scheduled_at;

-- =============================================================================
-- SECCIÓN 5 — Paquetes sobre-consumidos (used_sessions > total_sessions)
-- Hallazgo CR-006 race condition
-- =============================================================================
SELECT
  '5. PAQUETES CON SESIONES INCONSISTENTES' AS section,
  id,
  doctor_id,
  patient_id,
  plan_name,
  total_sessions,
  used_sessions,
  status,
  (used_sessions - total_sessions) AS excess
FROM patient_packages
WHERE used_sessions > total_sessions
   OR (status = 'completed' AND used_sessions < total_sessions)
   OR (status = 'active' AND used_sessions >= total_sessions);

-- Appointments con package_id pero el paquete no existe o es de otro doctor
SELECT
  '5b. APPOINTMENTS CON PACKAGE HUÉRFANO' AS section,
  a.id AS appointment_id,
  a.package_id,
  a.doctor_id AS appt_doctor,
  p.doctor_id AS pkg_doctor,
  CASE
    WHEN p.id IS NULL THEN 'package deleted'
    WHEN p.doctor_id <> a.doctor_id THEN 'doctor mismatch'
  END AS issue
FROM appointments a
LEFT JOIN patient_packages p ON p.id = a.package_id
WHERE a.package_id IS NOT NULL
  AND (p.id IS NULL OR p.doctor_id <> a.doctor_id);

-- =============================================================================
-- SECCIÓN 6 — Perfiles con role NULL (caen al default 'doctor' en callback)
-- Hallazgo AL-101
-- =============================================================================
-- Primero: qué valores admite el enum user_role realmente
SELECT
  '6pre. VALORES DEL ENUM user_role' AS section,
  unnest(enum_range(NULL::user_role))::text AS valid_role;

SELECT
  '6. PROFILES CON ROLE NULL' AS section,
  id,
  email,
  full_name,
  role::text AS role,
  phone IS NULL AS onboarding_incomplete,
  created_at
FROM profiles
WHERE role IS NULL
ORDER BY created_at DESC;

-- Usuarios en auth.users sin profile (deberían tener uno)
SELECT
  '6b. AUTH USERS SIN PROFILE' AS section,
  u.id,
  u.email,
  u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC
LIMIT 50;

-- =============================================================================
-- SECCIÓN 7 — Consultations huérfanas (appointment_id inexistente)
-- Hallazgo AL-107
-- =============================================================================
SELECT
  '7. CONSULTATIONS CON APPOINTMENT INEXISTENTE' AS section,
  c.id,
  c.consultation_code,
  c.doctor_id,
  c.patient_id,
  c.appointment_id,
  c.consultation_date,
  c.payment_status,
  c.amount
FROM consultations c
LEFT JOIN appointments a ON a.id = c.appointment_id
WHERE c.appointment_id IS NOT NULL AND a.id IS NULL;

-- EHR records huérfanos
SELECT
  '7b. EHR RECORDS HUÉRFANOS' AS section,
  e.id,
  e.consultation_id,
  e.patient_id,
  e.doctor_id,
  e.created_at
FROM ehr_records e
LEFT JOIN consultations c ON c.id = e.consultation_id
WHERE e.consultation_id IS NOT NULL AND c.id IS NULL;

-- Prescriptions huérfanas
SELECT
  '7c. PRESCRIPTIONS HUÉRFANAS' AS section,
  pr.id,
  pr.consultation_id,
  pr.patient_id,
  pr.doctor_id,
  pr.medication_name
FROM prescriptions pr
LEFT JOIN consultations c ON c.id = pr.consultation_id
WHERE pr.consultation_id IS NOT NULL AND c.id IS NULL;

-- =============================================================================
-- SECCIÓN 8 — Pacientes duplicados (mismo doctor + mismo email)
-- =============================================================================
SELECT
  '8. PACIENTES DUPLICADOS' AS section,
  doctor_id,
  LOWER(TRIM(email)) AS norm_email,
  array_agg(id ORDER BY created_at) AS patient_ids,
  array_agg(full_name) AS names,
  COUNT(*) AS n
FROM patients
WHERE email IS NOT NULL AND email <> ''
GROUP BY doctor_id, LOWER(TRIM(email))
HAVING COUNT(*) > 1
ORDER BY n DESC;

-- Pacientes sin auth_user_id pero con email que sí tiene cuenta en auth.users
SELECT
  '8b. PACIENTES NO VINCULADOS A AUTH' AS section,
  p.id,
  p.doctor_id,
  p.email,
  u.id AS existing_auth_user
FROM patients p
JOIN auth.users u ON LOWER(u.email) = LOWER(p.email)
WHERE p.auth_user_id IS NULL
LIMIT 50;

-- =============================================================================
-- SECCIÓN 9 — Finanzas: inconsistencias entre appointments y consultations
-- Hallazgo ME-205
-- =============================================================================
SELECT
  '9. APPOINTMENT COMPLETED PERO CONSULTATION UNPAID' AS section,
  a.id AS appointment_id,
  a.scheduled_at,
  a.plan_price,
  a.status AS appt_status,
  c.id AS consultation_id,
  c.payment_status,
  c.amount AS consult_amount
FROM appointments a
JOIN consultations c ON c.appointment_id = a.id
WHERE a.status = 'completed'
  AND c.payment_status IN ('unpaid','pending_approval')
ORDER BY a.scheduled_at DESC
LIMIT 50;

-- =============================================================================
-- SECCIÓN 10 — Tablas sin RLS habilitado (deberían tener RLS en un SaaS multi-tenant)
-- =============================================================================
SELECT
  '10. TABLAS SIN RLS' AS section,
  t.tablename,
  c.relrowsecurity AS rls_enabled
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname='public'
  AND NOT c.relrowsecurity
ORDER BY t.tablename;

-- Policies con USING (true) — equivalente a no tener RLS
SELECT
  '10b. POLICIES PERMISIVAS (USING true)' AS section,
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname='public'
  AND (qual = 'true' OR qual LIKE '%true%' AND length(qual) < 30);

-- =============================================================================
-- SECCIÓN 11 — DDL real de las tablas NO versionadas en el repo
--   Exporta el CREATE TABLE real para que puedas commitarlo al repo.
-- =============================================================================
-- Substitúyelo por cada tabla que te falta (o usa una herramienta como Supabase
-- Dashboard → Database → Tables → <tabla> → SQL)
-- Aquí generamos el DDL aproximado leyendo information_schema:

SELECT
  '11. DDL SUGERIDO PARA TABLAS FALTANTES' AS section,
  table_name,
  string_agg(
    '  ' || column_name || ' ' || udt_name ||
    CASE WHEN character_maximum_length IS NOT NULL THEN '(' || character_maximum_length || ')' ELSE '' END ||
    CASE WHEN is_nullable='NO' THEN ' NOT NULL' ELSE '' END ||
    CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
    E',\n'
    ORDER BY ordinal_position
  ) AS approx_ddl
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN (
    'subscriptions','subscription_payments','plan_configs','plan_features',
    'plan_promotions','reminders_queue','reminders_settings','payments',
    'doctor_suggestions','admin_suggestions'
  )
GROUP BY table_name
ORDER BY table_name;

-- =============================================================================
-- SECCIÓN 12 — Cuentas del endpoint peligroso /api/seed-accounts (si se usó)
-- =============================================================================
SELECT
  '12. CUENTAS DE PRUEBA CREADAS POR SEED' AS section,
  u.id,
  u.email,
  u.created_at,
  p.role,
  p.full_name
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email IN (
  'ivana@gmail.com',
  'metropolitana@gmail.com',
  'anasolanob07@gmail.com'
)
ORDER BY u.created_at DESC;

-- =============================================================================
-- SECCIÓN 13 — Tamaño de las tablas (orientar limpieza)
-- =============================================================================
SELECT
  '13. TAMAÑO DE TABLAS' AS section,
  t.tablename,
  pg_size_pretty(pg_total_relation_size('public.' || quote_ident(t.tablename))) AS total_size,
  (SELECT COUNT(*) FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.table_name=t.tablename) AS n_cols
FROM pg_tables t
WHERE schemaname='public'
ORDER BY pg_total_relation_size('public.' || quote_ident(t.tablename)) DESC;

-- =============================================================================
-- FIN — envíame el output de las 13 secciones.
-- =============================================================================
