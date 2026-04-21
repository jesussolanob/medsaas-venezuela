-- Validación final — checklist del informe de auditoría

-- 1. Tablas sin RLS
SELECT '1_tables_no_rls' AS check_name,
  COUNT(*) AS n,
  array_agg(t.tablename) AS tables
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname='public' AND NOT c.relrowsecurity;

-- 2. Policies permisivas (USING true) que NO sean legítimas
SELECT '2_unsafe_permissive' AS check_name,
  COUNT(*) FILTER (
    WHERE tablename NOT IN (
      'doctor_availability','doctor_blocked_slots','doctor_invitations',
      'doctor_schedule_config','plan_configs','plan_features','plan_promotions'
    )
  ) AS n_unsafe,
  array_agg(tablename || '.' || policyname) FILTER (
    WHERE tablename NOT IN (
      'doctor_availability','doctor_blocked_slots','doctor_invitations',
      'doctor_schedule_config','plan_configs','plan_features','plan_promotions'
    )
  ) AS unsafe_policies
FROM pg_policies
WHERE schemaname='public' AND qual = 'true';

-- 3. Policies duplicadas por tilde
SELECT '3_duplicate_policies' AS check_name, COUNT(*) AS n
FROM (
  SELECT tablename
  FROM pg_policies
  WHERE schemaname='public'
  GROUP BY tablename,
    translate(lower(policyname), 'áéíóúñÁÉÍÓÚÑ','aeiounAEIOUN')
  HAVING COUNT(*) > 1
) t;

-- 4. Índices duplicados restantes
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
SELECT '4_duplicate_indexes' AS check_name, COUNT(*) AS n
FROM (
  SELECT tablename, cols FROM idx GROUP BY tablename, cols HAVING COUNT(*) > 1
) t;

-- 5. Suscripciones con plan 'enterprise'
SELECT '5_enterprise_subs' AS check_name, COUNT(*) AS n
FROM subscriptions WHERE plan::text = 'enterprise';

-- 6. Profiles con role NULL
SELECT '6_null_roles' AS check_name, COUNT(*) AS n FROM profiles WHERE role IS NULL;

-- 7. Paquetes sobre-consumidos
SELECT '7_overused_packages' AS check_name, COUNT(*) AS n
FROM patient_packages WHERE used_sessions > total_sessions;

-- 8. Auth users sin profile (huérfanos)
SELECT '8_orphan_auth_users' AS check_name, COUNT(*) AS n,
  array_agg(u.email) AS emails
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 9. RPC book_with_package existe
SELECT '9_rpc_exists' AS check_name,
  (COUNT(*) > 0)::text AS exists
FROM pg_proc WHERE proname = 'book_with_package';

-- 10. Unique indexes preventivos existen
SELECT '10_unique_indexes' AS check_name,
  array_agg(indexname) AS created
FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN ('patients_doctor_email_uq','appointments_doctor_slot_uq');

-- 11. RLS en profiles
SELECT '11_profiles_rls' AS check_name,
  c.relrowsecurity::text AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname='profiles';

-- 12. Resumen final de todo
SELECT '12_final_summary' AS check_name,
  (SELECT COUNT(*) FROM profiles) AS n_profiles,
  (SELECT COUNT(*) FROM appointments) AS n_appointments,
  (SELECT COUNT(*) FROM consultations) AS n_consultations,
  (SELECT COUNT(*) FROM subscriptions) AS n_subscriptions,
  (SELECT COUNT(*) FROM auth.users) AS n_auth_users;
