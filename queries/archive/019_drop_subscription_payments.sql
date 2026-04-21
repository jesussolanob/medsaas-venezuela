-- @allow-write
-- Drop subscription_payments — tabla del flujo de aprobaciones eliminado.
-- Backup primero.

-- Pre-check
SELECT 'PRE_count' AS section, COUNT(*) AS rows FROM subscription_payments;

-- Backup en schema backup_20260421
CREATE TABLE IF NOT EXISTS backup_20260421.subscription_payments AS
  SELECT * FROM public.subscription_payments;

-- Drop la tabla (CASCADE para limpiar FKs si las hay)
DROP TABLE IF EXISTS public.subscription_payments CASCADE;

-- Verificación
SELECT 'POST_check' AS section,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name='subscription_payments') AS still_exists,
  (SELECT COUNT(*) FROM backup_20260421.subscription_payments) AS rows_in_backup;

-- Conteo final de tablas
SELECT 'POST_table_count' AS section, COUNT(*) AS total_tables
FROM pg_stat_user_tables WHERE schemaname='public';
