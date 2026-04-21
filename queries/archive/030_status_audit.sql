-- Auditoría real del estado actual de citas, consultas y pagos.
-- Objetivo: entender por qué los botones de status "no funcionan".

-- A. Enum values reales
SELECT 'A_appointment_status_enum' AS section,
  unnest(enum_range(NULL::appointment_status))::text AS val;

-- B. Estados actuales en appointments
SELECT 'B_appt_status_counts' AS section,
  status::text, COUNT(*) AS n
FROM appointments GROUP BY status ORDER BY n DESC;

-- C. Estados actuales de consultation payment_status
SELECT 'C_consult_payment_status' AS section,
  payment_status, COUNT(*) AS n
FROM consultations GROUP BY payment_status ORDER BY n DESC;

-- D. Verificar que RPCs existen y aceptan actor_id
SELECT 'D_rpc_signatures' AS section, proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('change_appointment_status','reschedule_appointment','book_with_package','restore_package_session','adjust_package_balance');

-- E. Últimos cambios registrados en el log (auditoría)
SELECT 'E_recent_changes' AS section,
  appointment_id, action, field_changed, old_value, new_value, created_at
FROM appointment_changes_log
ORDER BY created_at DESC
LIMIT 10;

-- F. ¿appointments tiene alguna consulta con appointment_id=NULL (huérfana)?
SELECT 'F_orphan_consultations' AS section,
  COUNT(*) FILTER (WHERE appointment_id IS NULL) AS without_appt,
  COUNT(*) AS total
FROM consultations;

-- G. Ejemplo de una appointment con su relación
SELECT 'G_sample_appt' AS section,
  a.id, a.patient_name, a.status::text, a.scheduled_at,
  c.id AS consult_id, c.payment_status, c.consultation_code
FROM appointments a
LEFT JOIN consultations c ON c.appointment_id = a.id
ORDER BY a.created_at DESC
LIMIT 5;
