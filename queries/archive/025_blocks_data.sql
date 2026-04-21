-- @allow-write
-- Añade columna blocks_data para guardar los valores de cada bloque en la consulta.
-- blocks_snapshot = metadata de la config (qué bloques, nombre, tipo)
-- blocks_data     = valores reales que el doctor llena

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS blocks_data jsonb DEFAULT '{}'::jsonb;

SELECT 'ok' AS status,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='consultations' AND column_name='blocks_data') AS has_column;
