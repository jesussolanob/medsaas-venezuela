-- @allow-write
-- Actualización 1 — Paquetes de consultas
-- Política confirmada: los paquetes NO VENCEN. Sólo se cierran cuando se
-- agotan las sesiones o el admin/doctor los cancela manualmente.

-- ─── 1. package_templates (catálogo) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.package_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  sessions_count  int  NOT NULL CHECK (sessions_count > 0),
  price_usd       numeric NOT NULL CHECK (price_usd >= 0),
  specialty       text,
  doctor_id       uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active       boolean DEFAULT true,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  -- Un paquete es específico (doctor_id), por especialidad (specialty), o ambos
  CONSTRAINT pt_scope_valid CHECK (doctor_id IS NOT NULL OR specialty IS NOT NULL)
);
ALTER TABLE public.package_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon reads active templates" ON public.package_templates;
CREATE POLICY "Anon reads active templates" ON public.package_templates
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Doctor manages own templates" ON public.package_templates;
CREATE POLICY "Doctor manages own templates" ON public.package_templates
  FOR ALL TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Super admin manages all templates" ON public.package_templates;
CREATE POLICY "Super admin manages all templates" ON public.package_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role));

-- ─── 2. patient_packages — extender ───────────────────────────────────────
ALTER TABLE public.patient_packages
  ADD COLUMN IF NOT EXISTS package_template_id uuid REFERENCES public.package_templates(id),
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS purchased_amount_usd numeric,
  ADD COLUMN IF NOT EXISTS notified_one_left boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ─── 3. package_balance_log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.package_balance_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      uuid NOT NULL REFERENCES public.patient_packages(id) ON DELETE CASCADE,
  delta           int  NOT NULL,
  balance_after   int  NOT NULL,
  reason          text NOT NULL CHECK (reason IN (
                    'appointment_booked','appointment_cancelled',
                    'admin_adjustment','refund','initial_allocation',
                    'doctor_adjustment')),
  appointment_id  uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  actor_id        uuid REFERENCES public.profiles(id),
  notes           text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pbl_package ON public.package_balance_log(package_id, created_at DESC);
ALTER TABLE public.package_balance_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor reads own log" ON public.package_balance_log;
CREATE POLICY "Doctor reads own log" ON public.package_balance_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM patient_packages pp
    WHERE pp.id = package_balance_log.package_id
      AND (pp.doctor_id = auth.uid() OR pp.auth_user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "Super admin reads all log" ON public.package_balance_log;
CREATE POLICY "Super admin reads all log" ON public.package_balance_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role));

-- ─── 4. RPCs ──────────────────────────────────────────────────────────────

-- 4a) book_with_package: redefinir para escribir en log
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_used int; v_total int; v_pkg_doctor uuid; v_pkg_status text;
  v_appt_id uuid; v_new_used int; v_new_stat text;
BEGIN
  SELECT used_sessions, total_sessions, doctor_id, status::text
    INTO v_used, v_total, v_pkg_doctor, v_pkg_status
  FROM patient_packages WHERE id = p_package_id FOR UPDATE;

  IF NOT FOUND                THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  IF v_pkg_doctor <> p_doctor_id THEN RAISE EXCEPTION 'PACKAGE_DOCTOR_MISMATCH'; END IF;
  IF v_pkg_status <> 'active'   THEN RAISE EXCEPTION 'PACKAGE_NOT_ACTIVE: %', v_pkg_status; END IF;
  IF v_used >= v_total        THEN RAISE EXCEPTION 'PACKAGE_EXHAUSTED'; END IF;

  v_new_used := v_used + 1;
  v_new_stat := CASE WHEN v_new_used >= v_total THEN 'completed' ELSE v_pkg_status END;

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

  UPDATE patient_packages
     SET used_sessions = v_new_used, status = v_new_stat, updated_at = NOW()
   WHERE id = p_package_id;

  -- Log auditable
  INSERT INTO package_balance_log (package_id, delta, balance_after, reason, appointment_id, actor_id)
  VALUES (p_package_id, -1, v_total - v_new_used, 'appointment_booked', v_appt_id, p_auth_user_id);

  appointment_id := v_appt_id;
  package_remaining := v_total - v_new_used;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.book_with_package(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_with_package(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,numeric,text) TO authenticated, service_role;

-- 4b) restore_package_session (al cancelar cita que usaba paquete)
CREATE OR REPLACE FUNCTION public.restore_package_session(
  p_appointment_id uuid,
  p_reason text DEFAULT 'appointment_cancelled'
) RETURNS TABLE(package_id uuid, new_used int, new_balance int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_pkg_id uuid; v_used int; v_total int; v_new_used int;
BEGIN
  SELECT package_id INTO v_pkg_id FROM appointments WHERE id = p_appointment_id;
  IF v_pkg_id IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_NO_PACKAGE'; END IF;

  SELECT used_sessions, total_sessions INTO v_used, v_total
  FROM patient_packages WHERE id = v_pkg_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  IF v_used <= 0 THEN RAISE EXCEPTION 'PACKAGE_BALANCE_ALREADY_ZERO'; END IF;

  v_new_used := v_used - 1;

  UPDATE patient_packages
     SET used_sessions = v_new_used,
         status = CASE WHEN v_new_used < v_total AND status::text = 'completed'
                       THEN 'active' ELSE status END,
         updated_at = NOW()
   WHERE id = v_pkg_id;

  -- Desligar la cita del paquete
  UPDATE appointments SET package_id = NULL, session_number = NULL
   WHERE id = p_appointment_id;

  -- Log
  INSERT INTO package_balance_log (package_id, delta, balance_after, reason, appointment_id, actor_id)
  VALUES (v_pkg_id, +1, v_total - v_new_used, p_reason, p_appointment_id, auth.uid());

  package_id := v_pkg_id;
  new_used := v_new_used;
  new_balance := v_total - v_new_used;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.restore_package_session(uuid, text) TO authenticated, service_role;

-- 4c) adjust_package_balance (admin/doctor hace ajuste manual)
CREATE OR REPLACE FUNCTION public.adjust_package_balance(
  p_package_id uuid,
  p_delta int,               -- negativo = descontar; positivo = añadir sesiones
  p_notes text
) RETURNS TABLE(new_used int, new_balance int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_used int; v_total int; v_new_used int; v_caller_role text; v_pkg_doctor uuid;
BEGIN
  IF p_delta = 0 THEN RAISE EXCEPTION 'DELTA_ZERO'; END IF;

  SELECT role::text INTO v_caller_role FROM profiles WHERE id = auth.uid();
  SELECT used_sessions, total_sessions, doctor_id
    INTO v_used, v_total, v_pkg_doctor
  FROM patient_packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;

  -- Solo el doctor owner o super_admin puede ajustar
  IF v_caller_role <> 'super_admin' AND auth.uid() <> v_pkg_doctor THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_new_used := v_used - p_delta;   -- p_delta positivo = añadir sesiones = used baja
  IF v_new_used < 0 THEN RAISE EXCEPTION 'BALANCE_NEGATIVE'; END IF;
  IF v_new_used > v_total THEN RAISE EXCEPTION 'USED_EXCEEDS_TOTAL'; END IF;

  UPDATE patient_packages
     SET used_sessions = v_new_used,
         status = CASE WHEN v_new_used >= v_total THEN 'completed'
                       WHEN v_new_used < v_total AND status::text = 'completed' THEN 'active'
                       ELSE status END,
         updated_at = NOW()
   WHERE id = p_package_id;

  INSERT INTO package_balance_log (package_id, delta, balance_after, reason, actor_id, notes)
  VALUES (p_package_id, p_delta, v_total - v_new_used,
          CASE WHEN v_caller_role = 'super_admin' THEN 'admin_adjustment' ELSE 'doctor_adjustment' END,
          auth.uid(), p_notes);

  new_used := v_new_used;
  new_balance := v_total - v_new_used;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.adjust_package_balance(uuid, int, text) TO authenticated, service_role;

-- ─── 5. Seed inicial del log para paquetes existentes ─────────────────────
INSERT INTO package_balance_log (package_id, delta, balance_after, reason, actor_id, notes)
SELECT pp.id, pp.used_sessions, pp.total_sessions - pp.used_sessions,
       'initial_allocation', pp.doctor_id,
       'Backfill automático al migrar a sistema de log'
FROM patient_packages pp
WHERE NOT EXISTS (SELECT 1 FROM package_balance_log pbl WHERE pbl.package_id = pp.id);

-- ─── Verificación ─────────────────────────────────────────────────────────
SELECT 'schema_check' AS section,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='package_templates') AS has_templates,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='package_balance_log') AS has_log,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'book_with_package') AS has_rpc_book,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'restore_package_session') AS has_rpc_restore,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'adjust_package_balance') AS has_rpc_adjust;
