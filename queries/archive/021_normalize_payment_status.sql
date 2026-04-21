-- @allow-write
-- Normalizar payment_status a: pending | approved | cancelled
-- Current values: 'approved' (4), 'pending_approval' (1)
-- Objetivo: pending_approval → pending (consistencia con el resto del sistema)

-- Pre-check
SELECT 'PRE' AS section, payment_status, COUNT(*) AS n
FROM consultations GROUP BY payment_status;

-- Normalizar
UPDATE consultations
   SET payment_status = 'pending'
 WHERE payment_status = 'pending_approval';

UPDATE consultations
   SET payment_status = 'pending'
 WHERE payment_status IS NULL OR payment_status = '' OR payment_status = 'unpaid';

-- Garantizar que todo registro tenga un status válido
ALTER TABLE consultations
  ALTER COLUMN payment_status SET DEFAULT 'pending',
  ALTER COLUMN payment_status SET NOT NULL;

-- Constraint para los 3 estados permitidos (drop antes si existe)
ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_payment_status_check;
ALTER TABLE consultations
  ADD CONSTRAINT consultations_payment_status_check
  CHECK (payment_status IN ('pending','approved','cancelled'));

-- Verificación
SELECT 'POST' AS section, payment_status, COUNT(*) AS n
FROM consultations GROUP BY payment_status;

-- Consultas sin status (debería ser 0)
SELECT 'POST_null' AS section, COUNT(*) AS null_status
FROM consultations WHERE payment_status IS NULL;
