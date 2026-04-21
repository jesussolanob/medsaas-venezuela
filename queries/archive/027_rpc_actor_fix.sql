-- @allow-write
-- Fix: change_appointment_status y reschedule_appointment fallan con NOT_AUTHENTICATED
-- cuando se llaman desde el endpoint con service_role (admin client). auth.uid()
-- retorna NULL en service_role.
--
-- Solución: aceptar p_actor_id como parámetro explícito para que funcione
-- tanto desde user-client como desde service-role.

-- ─── change_appointment_status ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_appointment_status(
  p_appointment_id  uuid,
  p_new_status      text,
  p_reason          text DEFAULT NULL,
  p_actor_id        uuid DEFAULT NULL   -- ← nuevo parámetro
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_doctor_id uuid; v_caller_role text; v_caller uuid; v_package_id uuid;
BEGIN
  -- Prefiere actor explícito; si no, usa auth.uid()
  v_caller := COALESCE(p_actor_id, auth.uid());
  IF v_caller IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT role::text INTO v_caller_role FROM profiles WHERE id = v_caller;
  SELECT doctor_id, package_id INTO v_doctor_id, v_package_id
  FROM appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND'; END IF;

  IF v_caller <> v_doctor_id AND v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_new_status NOT IN ('scheduled','confirmed','completed','cancelled','no_show','pending','accepted') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  UPDATE appointments SET status = p_new_status::appointment_status, updated_at = NOW()
    WHERE id = p_appointment_id;

  -- Si se cancela y tenía paquete, restituir la sesión
  IF p_new_status = 'cancelled' AND v_package_id IS NOT NULL THEN
    PERFORM public.restore_package_session(p_appointment_id, 'appointment_cancelled');
  END IF;

  -- Anotar razón en el log del trigger
  IF p_reason IS NOT NULL THEN
    UPDATE appointment_changes_log SET reason = p_reason
      WHERE appointment_id = p_appointment_id
        AND field_changed = 'status'
        AND created_at = (SELECT MAX(created_at) FROM appointment_changes_log
                          WHERE appointment_id = p_appointment_id AND field_changed = 'status');
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.change_appointment_status(uuid, text, text, uuid)
  TO authenticated, service_role;

-- ─── reschedule_appointment ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_appointment_id    uuid,
  p_new_scheduled_at  timestamptz,
  p_reason            text DEFAULT NULL,
  p_actor_id          uuid DEFAULT NULL
) RETURNS TABLE(appointment_id uuid, new_scheduled_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_doctor_id uuid; v_caller_role text; v_caller uuid;
BEGIN
  v_caller := COALESCE(p_actor_id, auth.uid());
  IF v_caller IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT role::text INTO v_caller_role FROM profiles WHERE id = v_caller;
  SELECT doctor_id INTO v_doctor_id
  FROM appointments WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND'; END IF;

  IF v_caller <> v_doctor_id AND v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'UNAUTHORIZED_RESCHEDULE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM appointments
    WHERE doctor_id = v_doctor_id AND id <> p_appointment_id
      AND scheduled_at = p_new_scheduled_at
      AND status::text IN ('scheduled','confirmed','pending','accepted')
  ) THEN
    RAISE EXCEPTION 'SLOT_CONFLICT';
  END IF;

  UPDATE appointments SET scheduled_at = p_new_scheduled_at, updated_at = NOW()
    WHERE id = p_appointment_id;

  IF p_reason IS NOT NULL THEN
    UPDATE appointment_changes_log SET reason = p_reason
      WHERE appointment_id = p_appointment_id
        AND field_changed = 'scheduled_at'
        AND created_at = (SELECT MAX(created_at) FROM appointment_changes_log
                          WHERE appointment_id = p_appointment_id AND field_changed = 'scheduled_at');
  END IF;

  appointment_id := p_appointment_id;
  new_scheduled_at := p_new_scheduled_at;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, text, uuid)
  TO authenticated, service_role;

SELECT 'ok' AS status;
