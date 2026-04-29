-- ============================================================================
-- Subscription System — Fase 1
-- Fecha: 2026-04-29
-- ============================================================================
-- Inspirado en Shopify/Stripe:
--   1. app_settings: singleton key/value store para config global del SaaS
--      (precio base, duración beta, métodos de pago habilitados, etc.)
--      → Pattern equivalente a Shopify "Shop Settings" o Stripe "Account
--        Settings": el admin cambia y se aplica al instante sin redeploy.
--
--   2. subscription_changes_log: audit trail inmutable de cada cambio de
--      estado en una suscripción (extender, suspender, reactivar, cambio de
--      plan, aprobación de pago).
--      → Pattern equivalente a Shopify "Order Timeline" o Stripe "Events":
--        permite rastrear quién hizo qué y cuándo, para soporte y disputas.
--
-- NO toca tablas existentes (subscriptions, subscription_payments,
-- plan_promotions, plan_configs, plan_features). Solo añade.
-- ============================================================================

-- ─── app_settings ──────────────────────────────────────────────────────────
-- Singleton key/value para config global. Tipos: string, number, boolean, json.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key          text PRIMARY KEY,
  value        jsonb NOT NULL,
  description  text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Solo super_admin / admin pueden leer/escribir. El doctor lee subset
-- vía endpoint server-side (no directo).
DROP POLICY IF EXISTS "app_settings_admin_all" ON public.app_settings;
CREATE POLICY "app_settings_admin_all"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ─── Seed defaults (idempotente) ────────────────────────────────────────────
INSERT INTO public.app_settings (key, value, description) VALUES
  ('subscription_base_price_usd',
   '30'::jsonb,
   'Precio base mensual del plan único en USD (ajustable por admin)'),
  ('subscription_currency',
   '"USD"'::jsonb,
   'Moneda del precio base'),
  ('beta_duration_days',
   '365'::jsonb,
   'Duración del trial Beta Privada para nuevos médicos (en días)'),
  ('payment_methods_enabled',
   '["pago_movil","transferencia","zelle"]'::jsonb,
   'Métodos de pago habilitados para que el doctor pague su suscripción'),
  ('payment_methods_config',
   jsonb_build_object(
     'pago_movil',     jsonb_build_object('phone','','cedula','','bank',''),
     'transferencia',  jsonb_build_object('bank','','account','','holder',''),
     'zelle',          jsonb_build_object('email','','holder','')
   ),
   'Datos de cobro por método (nro de cuenta, email Zelle, etc.)'),
  ('stripe_enabled',
   'false'::jsonb,
   'Activa el flujo Stripe (cuando el admin haya configurado las API keys)'),
  ('expiration_warning_days',
   '[7,3,1]'::jsonb,
   'Días antes del vencimiento en que se notifica al doctor')
ON CONFLICT (key) DO NOTHING;

-- ─── subscription_changes_log ──────────────────────────────────────────────
-- Audit trail de cada cambio en una suscripción. INMUTABLE — solo INSERT.
CREATE TABLE IF NOT EXISTS public.subscription_changes_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  doctor_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action          text NOT NULL CHECK (action IN (
                    'created',
                    'extended',
                    'suspended',
                    'reactivated',
                    'cancelled',
                    'plan_changed',
                    'payment_approved',
                    'payment_rejected',
                    'price_adjusted',
                    'manual_grant',
                    'manual_revoke'
                  )),
  actor_id        uuid REFERENCES public.profiles(id),
  actor_role      text,
  -- Snapshot del estado antes y después (para diffs en la UI)
  before_state    jsonb,
  after_state     jsonb,
  -- Contexto extra: nro de meses extendidos, payment_id si aplica, etc.
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_changes_log_subscription
  ON public.subscription_changes_log(subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_changes_log_doctor
  ON public.subscription_changes_log(doctor_id, created_at DESC);

ALTER TABLE public.subscription_changes_log ENABLE ROW LEVEL SECURITY;

-- Doctor lee SOLO los cambios de su propia suscripción (transparencia).
DROP POLICY IF EXISTS "sub_changes_log_self_read" ON public.subscription_changes_log;
CREATE POLICY "sub_changes_log_self_read"
  ON public.subscription_changes_log FOR SELECT
  TO authenticated
  USING (
    doctor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- Solo el server (service_role) puede insertar — no INSERT directo desde RLS.
-- Las APIs del admin/doctor llamarán al service_role para insertar.

-- ─── Helper: recompute days_remaining ──────────────────────────────────────
-- VIEW útil para listar doctores con días restantes calculados en SQL.
CREATE OR REPLACE VIEW public.subscription_status_view AS
SELECT
  s.id AS subscription_id,
  s.doctor_id,
  p.full_name AS doctor_name,
  p.email AS doctor_email,
  p.specialty,
  s.plan,
  s.status,
  s.price_usd,
  s.billing_cycle,
  s.current_period_start,
  s.current_period_end,
  s.trial_ends_at,
  s.cancelled_at,
  -- Días restantes calculados al vuelo
  GREATEST(
    0,
    CEIL(EXTRACT(EPOCH FROM (s.current_period_end - now())) / 86400)::int
  ) AS days_remaining,
  -- Flags para filtros rápidos en UI
  (s.current_period_end < now()) AS is_expired,
  (s.current_period_end < (now() + interval '7 days')
    AND s.current_period_end >= now()) AS expiring_soon,
  (s.status = 'trial') AS is_in_trial,
  s.created_at,
  s.updated_at
FROM public.subscriptions s
JOIN public.profiles p ON p.id = s.doctor_id
WHERE p.role IN ('doctor');

GRANT SELECT ON public.subscription_status_view TO authenticated;

-- ─── Trigger: auto-actualizar updated_at en app_settings ───────────────────
CREATE OR REPLACE FUNCTION public.tg_app_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS app_settings_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_app_settings_updated_at();

-- ============================================================================
-- DONE. Para aplicar:
--   psql $SUPABASE_DB_URL -f 20260429_subscription_system_phase1.sql
-- O desde Supabase dashboard → SQL Editor → ejecutar este archivo entero.
-- ============================================================================
