-- @allow-write
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_reference text;

SELECT 'ok' AS status,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='appointments' AND column_name='payment_reference') AS has_col;
