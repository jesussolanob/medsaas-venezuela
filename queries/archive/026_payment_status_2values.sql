-- @allow-write
-- payment_status de consultations: solo 2 estados (pending | approved)
-- Nota: los estados de CITA (agendada, aprobada, rechazada) viven en appointments.status
-- Los estados de CONSULTA (asistió / no asistió) también en appointments.status (completed/no_show)
-- El PAGO no se "cancela" — o está pendiente o aprobado.

-- Normalizar registros con 'cancelled' a 'pending' antes de cambiar el constraint
UPDATE consultations SET payment_status = 'pending' WHERE payment_status = 'cancelled';
UPDATE consultations SET payment_status = 'pending' WHERE payment_status NOT IN ('pending','approved');

-- Reemplazar el constraint
ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_payment_status_check;
ALTER TABLE consultations
  ADD CONSTRAINT consultations_payment_status_check
  CHECK (payment_status IN ('pending','approved'));

-- Verificación
SELECT 'POST' AS section, payment_status, COUNT(*) AS n
FROM consultations GROUP BY payment_status;
