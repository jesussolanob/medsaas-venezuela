-- @allow-write
-- Actualización 3 — Agenda: log inmutable de cambios + RPCs transaccionales
-- Garantía: una cita no se mueve sola. Sólo el doctor owner o super_admin
-- pueden reagendar, y cada cambio queda registrado.

-- ─── 1. Log inmutable de cambios en appointments ──────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_changes_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  actor_id        uuid REFERENCES public.profiles(id),
  actor_role      text,
  action          text NOT NULL CHECK (action IN (
                    'created','rescheduled','cancelled','completed','no_show',
                    'in_progress','duration_changed','notes_updated','status_changed',
                    'reminder_sent','admin_override','restored')),
  field_changed   text,
  old_value       text,
  new_value       text,
  reason          text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acl_appt ON public.appointment_changes_log(appointment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acl_actor ON public.appointment_changes_log(actor_id, created_at DESC);
ALTER TABLE public.appointment_changes_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor reads own appointment log" ON public.appointment_changes_log;
CREATE POLICY "Doctor reads own appointment log" ON public.appointment_changes_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM appointments a WHERE a.id = appointment_changes_log.appointment_id
      AND (a.doctor_id = auth.uid() OR a.auth_user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "Super admin reads all appointment log" ON public.appointment_changes_log;
CREATE POLICY "Super admin reads all appointment log" ON public.appointment_changes_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role));

-- ─── 2. Trigger auto-log en UPDATE de appointments ────────────────────────
CREATE OR REPLACE FUNCTION public.log_appointment_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  -- actor = auth.uid() si viene de user session, o null si es background/service
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;

  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    INSERT INTO appointment_changes_log (appointment_id, actor_id, action, field_changed, old_value, new_value)
    VALUES (NEW.id, v_actor, 'rescheduled', 'scheduled_at',
            OLD.scheduled_at::text, NEW.scheduled_at::text);
  END IF;

  IF NEW.status::text IS DISTINCT FROM OLD.status::text THEN
    INSERT INTO appointment_changes_log (appointment_id, actor_id, action, field_changed, old_value, new_value)
    VALUES (NEW.id, v_actor,
            CASE NEW.status::text
              WHEN 'cancelled'  THEN 'cancelled'
              WHEN 'completed'  THEN 'completed'
              WHEN 'no_show'    THEN 'no_show'
              ELSE 'status_changed' END,
            'status', OLD.status::text, NEW.status::text);
  END IF;

  IF NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes THEN
    INSERT INTO appointment_changes_log (appointment_id, actor_id, action, field_changed, old_value, new_value)
    VALUES (NEW.id, v_actor, 'duration_changed', 'duration_minutes',
            COALESCE(OLD.duration_minutes::text, 'null'), COALESCE(NEW.duration_minutes::text, 'null'));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_appointment_update ON public.appointments;
CREATE TRIGGER trg_log_appointment_update
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.log_appointment_update();

-- Log también al crear
CREATE OR REPLACE FUNCTION public.log_appointment_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid;
BEGIN
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  INSERT INTO appointment_changes_log (appointment_id, actor_id, action, new_value)
  VALUES (NEW.id, v_actor, 'created', NEW.scheduled_at::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_appointment_insert ON public.appointments;
CREATE TRIGGER trg_log_appointment_insert
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.log_appointment_insert();

-- ─── 3. RPC reschedule_appointment ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_appointment_id    uuid,
  p_new_scheduled_at  timestamptz,
  p_reason            text DEFAULT NULL
) RETURNS TABLE(appointment_id uuid, new_scheduled_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_doctor_id uuid; v_caller_role text; v_caller uuid; v_old_time timestamptz;
  v_duration int;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT role::text INTO v_caller_role FROM profiles WHERE id = v_caller;
  SELECT doctor_id, scheduled_at, COALESCE(duration_minutes, 30)
    INTO v_doctor_id, v_old_time, v_duration
  FROM appointments WHERE id = p_appointment_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND'; END IF;

  -- Solo el doctor owner o super_admin pueden reagendar
  IF v_caller <> v_doctor_id AND v_caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'UNAUTHORIZED_RESCHEDULE';
  END IF;

  -- Detectar conflictos (otro appt del mismo doctor en el mismo slot exacto)
  IF EXISTS (
    SELECT 1 FROM appointments
    WHERE doctor_id = v_doctor_id
      AND id <> p_appointment_id
      AND scheduled_at = p_new_scheduled_at
      AND status::text IN ('scheduled','confirmed','pending','accepted')
  ) THEN
    RAISE EXCEPTION 'SLOT_CONFLICT';
  END IF;

  UPDATE appointments
    SET scheduled_at = p_new_scheduled_at, updated_at = NOW()
    WHERE id = p_appointment_id;

  -- El trigger registra el cambio; añadimos la razón
  IF p_reason IS NOT NULL THEN
    UPDATE appointment_changes_log
      SET reason = p_reason
      WHERE appointment_id = p_appointment_id
        AND field_changed = 'scheduled_at'
        AND created_at = (SELECT MAX(created_at) FROM appointment_changes_log
                          WHERE appointment_id = p_appointment_id AND field_changed = 'scheduled_at');
  END IF;

  appointment_id := p_appointment_id;
  new_scheduled_at := p_new_scheduled_at;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, text) TO authenticated, service_role;

-- ─── 4. RPC change_appointment_status ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_appointment_status(
  p_appointment_id  uuid,
  p_new_status      text,
  p_reason          text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_doctor_id uuid; v_caller_role text; v_caller uuid; v_package_id uuid;
BEGIN
  v_caller := auth.uid();
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

  -- Si se cancela y tenía paquete, restituir la sesión automáticamente
  IF p_new_status = 'cancelled' AND v_package_id IS NOT NULL THEN
    PERFORM public.restore_package_session(p_appointment_id, 'appointment_cancelled');
  END IF;

  -- Anotar razón si se dio
  IF p_reason IS NOT NULL THEN
    UPDATE appointment_changes_log SET reason = p_reason
      WHERE appointment_id = p_appointment_id
        AND field_changed = 'status'
        AND created_at = (SELECT MAX(created_at) FROM appointment_changes_log
                          WHERE appointment_id = p_appointment_id AND field_changed = 'status');
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.change_appointment_status(uuid, text, text) TO authenticated, service_role;

-- ─── Verificación ─────────────────────────────────────────────────────────
SELECT 'check' AS section,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='appointment_changes_log') AS log_table,
  (SELECT COUNT(*) FROM pg_proc WHERE proname='reschedule_appointment') AS rpc_reschedule,
  (SELECT COUNT(*) FROM pg_proc WHERE proname='change_appointment_status') AS rpc_status,
  (SELECT COUNT(*) FROM pg_trigger WHERE tgname='trg_log_appointment_update') AS trg_update,
  (SELECT COUNT(*) FROM pg_trigger WHERE tgname='trg_log_appointment_insert') AS trg_insert;
