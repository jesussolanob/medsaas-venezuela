-- @allow-write
-- PASO 5 — Función transaccional para booking con paquete prepagado (CR-006).
--
-- Reemplaza el patrón "INSERT appointment; luego UPDATE package" del endpoint
-- /api/book por una transacción SERIALIZABLE con FOR UPDATE lock del paquete.
-- Imposible la doble reserva concurrente.

CREATE OR REPLACE FUNCTION public.book_with_package(
  p_package_id       uuid,
  p_doctor_id        uuid,
  p_patient_id       uuid,
  p_auth_user_id     uuid,
  p_scheduled_at     timestamptz,
  p_patient_name     text,
  p_patient_phone    text,
  p_patient_email    text,
  p_plan_name        text,
  p_chief_complaint  text DEFAULT NULL,
  p_appointment_mode text DEFAULT 'presencial',
  p_bcv_rate         numeric DEFAULT NULL,
  p_patient_cedula   text DEFAULT NULL
) RETURNS TABLE(appointment_id uuid, package_remaining int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_used      int;
  v_total     int;
  v_pkg_doc   uuid;
  v_pkg_stat  text;
  v_appt_id   uuid;
  v_new_used  int;
  v_new_stat  text;
BEGIN
  -- Lock de la fila del paquete: serializa bookings concurrentes sobre el mismo paquete.
  SELECT used_sessions, total_sessions, doctor_id, status::text
    INTO v_used, v_total, v_pkg_doc, v_pkg_stat
  FROM patient_packages
  WHERE id = p_package_id
  FOR UPDATE;

  IF NOT FOUND                THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  IF v_pkg_doc <> p_doctor_id THEN RAISE EXCEPTION 'PACKAGE_DOCTOR_MISMATCH'; END IF;
  IF v_pkg_stat <> 'active'   THEN RAISE EXCEPTION 'PACKAGE_NOT_ACTIVE: %', v_pkg_stat; END IF;
  IF v_used >= v_total        THEN RAISE EXCEPTION 'PACKAGE_EXHAUSTED'; END IF;

  v_new_used := v_used + 1;
  v_new_stat := CASE WHEN v_new_used >= v_total THEN 'completed' ELSE v_pkg_stat END;

  -- Crear la cita. El status es enum appointment_status, cast explícito.
  INSERT INTO appointments (
    doctor_id, patient_id, patient_name, patient_phone, patient_email,
    patient_cedula, scheduled_at, status, source, chief_complaint,
    plan_name, plan_price, payment_method, appointment_mode,
    bcv_rate, auth_user_id, package_id, session_number
  ) VALUES (
    p_doctor_id, p_patient_id, p_patient_name, p_patient_phone, p_patient_email,
    p_patient_cedula, p_scheduled_at, 'scheduled'::appointment_status, 'booking', p_chief_complaint,
    p_plan_name, 0, 'package', p_appointment_mode,
    p_bcv_rate, p_auth_user_id, p_package_id, v_new_used
  ) RETURNING id INTO v_appt_id;

  -- Actualizar el paquete (en la misma transacción, lock aún vigente)
  UPDATE patient_packages
     SET used_sessions = v_new_used,
         status        = v_new_stat,
         updated_at    = NOW()
   WHERE id = p_package_id;

  appointment_id    := v_appt_id;
  package_remaining := v_total - v_new_used;
  RETURN NEXT;
END $$;

-- Permisos: revocar default y otorgar selectivo
REVOKE ALL ON FUNCTION public.book_with_package(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, numeric, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.book_with_package(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, numeric, text
) TO service_role, authenticated;

-- Verificación
SELECT 'V1_rpc_created' AS section,
  proname,
  pronargs,
  pg_get_function_result(oid) AS returns
FROM pg_proc
WHERE proname = 'book_with_package';

-- Verificar que NO es accesible desde anon (buena práctica)
SELECT 'V2_rpc_grants' AS section,
  r.rolname AS role,
  has_function_privilege(
    r.rolname,
    'public.book_with_package(uuid, uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, numeric, text)',
    'EXECUTE'
  ) AS can_execute
FROM pg_roles r
WHERE r.rolname IN ('anon','authenticated','service_role')
ORDER BY r.rolname;
