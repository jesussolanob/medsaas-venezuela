-- @allow-write
-- Drop tablas con 0 referencias en el código fuente (verificado por grep).
-- Backup ya existe (backup_20260420 desde el paso 1).

-- Pre-check: confirmar que están vacías
SELECT 'PRE_check' AS section, relname,
  (SELECT COUNT(*) FROM pg_stat_user_tables p2 WHERE p2.relname = p.relname AND p2.n_live_tup > 0) AS has_data
FROM pg_stat_user_tables p
WHERE schemaname='public'
  AND relname IN ('waitlist','payments','doctor_patient_links','appointment_reminders_config');

-- Backup adicional (por si algún trigger las usa internamente)
CREATE SCHEMA IF NOT EXISTS backup_20260421;
CREATE TABLE IF NOT EXISTS backup_20260421.waitlist                     AS SELECT * FROM public.waitlist;
CREATE TABLE IF NOT EXISTS backup_20260421.payments                     AS SELECT * FROM public.payments;
CREATE TABLE IF NOT EXISTS backup_20260421.doctor_patient_links         AS SELECT * FROM public.doctor_patient_links;
CREATE TABLE IF NOT EXISTS backup_20260421.appointment_reminders_config AS SELECT * FROM public.appointment_reminders_config;

-- DROP CASCADE para evitar fallos por FKs
DROP TABLE IF EXISTS public.waitlist                     CASCADE;
DROP TABLE IF EXISTS public.payments                     CASCADE;
DROP TABLE IF EXISTS public.doctor_patient_links         CASCADE;
DROP TABLE IF EXISTS public.appointment_reminders_config CASCADE;

-- Verificación post
SELECT 'POST_check' AS section,
  count(*) FILTER (WHERE relname IN ('waitlist','payments','doctor_patient_links','appointment_reminders_config')) AS still_alive
FROM pg_stat_user_tables WHERE schemaname='public';

-- Conteo final
SELECT 'POST_total_tables' AS section, COUNT(*) AS total
FROM pg_stat_user_tables WHERE schemaname='public';
