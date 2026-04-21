-- Exporta DDL completo de las tablas que NO están versionadas en el repo.
-- READ ONLY — solo genera texto que yo copiaré a sql_migration_v24.sql

-- A. Todas las columnas con default, tipo, nullable, checks
SELECT
  'A_ddl_columns' AS section,
  table_name,
  column_name,
  udt_schema || '.' || udt_name AS type,
  is_nullable,
  column_default,
  ordinal_position AS ord
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN (
    'subscriptions','subscription_payments','plan_configs','plan_features',
    'plan_promotions','reminders_queue','reminders_settings'
  )
ORDER BY table_name, ordinal_position;

-- B. Constraints (PK, FK, UNIQUE, CHECK)
SELECT
  'B_constraints' AS section,
  conrelid::regclass::text AS table_name,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
  'public.subscriptions'::regclass,
  'public.subscription_payments'::regclass,
  'public.plan_configs'::regclass,
  'public.plan_features'::regclass,
  'public.plan_promotions'::regclass,
  'public.reminders_queue'::regclass,
  'public.reminders_settings'::regclass
)
ORDER BY table_name, conname;

-- C. Indexes (que no sean PK o constraints)
SELECT
  'C_indexes' AS section,
  schemaname || '.' || tablename AS table_name,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN (
    'subscriptions','subscription_payments','plan_configs','plan_features',
    'plan_promotions','reminders_queue','reminders_settings'
  )
ORDER BY tablename, indexname;

-- D. Policies RLS
SELECT
  'D_policies' AS section,
  tablename, policyname, cmd, roles,
  qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN (
    'subscriptions','subscription_payments','plan_configs','plan_features',
    'plan_promotions','reminders_queue','reminders_settings'
  )
ORDER BY tablename, policyname;
