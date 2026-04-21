-- Análisis: ¿Qué tablas tienen 0 rows? ¿Qué columnas son redundantes?
-- READ ONLY

-- 1. Conteo de filas en TODAS las tablas (para detectar las muertas)
SELECT 'A_table_rows' AS section,
  schemaname || '.' || tablename AS tbl,
  n_live_tup AS row_count,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||quote_ident(tablename))) AS size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC, tablename;

-- 2. Tablas que el código usa (grep externo es tu amigo, pero acá listamos
--    las "esperadas" según CLAUDE.md y vemos si existen vs si tienen data)
SELECT 'B_expected_vs_actual' AS section,
  expected.name AS expected_table,
  (t.tablename IS NOT NULL) AS exists_in_db,
  COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = expected.name), 0) AS rows
FROM (VALUES
  ('profiles'), ('subscriptions'), ('subscription_payments'),
  ('plan_configs'), ('plan_features'), ('plan_promotions'),
  ('appointments'), ('patients'), ('patient_packages'),
  ('consultations'), ('ehr_records'), ('prescriptions'),
  ('patient_messages'), ('billing_documents'), ('consultation_payments'),
  ('clinics'), ('clinic_invitations'), ('doctor_invitations'),
  ('doctor_availability'), ('doctor_blocked_slots'), ('doctor_schedule_config'),
  ('doctor_services'), ('doctor_templates'), ('doctor_quick_items'),
  ('doctor_insurances'), ('doctor_offices'), ('doctor_patient_links'),
  ('doctor_suggestions'), ('reminders_queue'), ('reminders_settings'),
  ('appointment_reminders_config'),
  ('leads'), ('lead_messages'), ('admin_roles'),
  ('invoices'), ('payments'), ('accounts_payable'),
  ('pricing_plans'), ('waitlist')
) AS expected(name)
LEFT JOIN pg_tables t ON t.schemaname='public' AND t.tablename = expected.name;

-- 3. Tablas con 0 rows (candidatas a drop si no se usan en el código)
SELECT 'C_empty_tables' AS section,
  tablename
FROM pg_stat_user_tables
WHERE schemaname='public' AND n_live_tup = 0
ORDER BY tablename;

-- 4. Existencia del super_admin role en admin_roles
SELECT 'D_admin_roles_data' AS section, COUNT(*) AS n FROM admin_roles;
