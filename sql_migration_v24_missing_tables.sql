-- ============================================================================
-- MIGRATION v24 — DDL faltante de tablas no versionadas (CR-002)
--
-- Estas tablas se crearon directamente en Supabase Dashboard y nunca estuvieron
-- en un archivo .sql del repo. Este migration las declara IDEMPOTENTEMENTE para
-- que el repo sea fuente de verdad y cualquier desarrollador pueda reconstruir
-- el schema desde cero.
--
-- Uso: ya ejecutado en prod (refleja el estado actual). Sólo commitear al repo.
-- Idempotencia: IF NOT EXISTS + CREATE OR REPLACE en todas las operaciones.
-- ============================================================================


-- ─── 1. Enums ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('super_admin', 'doctor', 'assistant', 'patient');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan') THEN
    CREATE TYPE subscription_plan AS ENUM ('trial', 'basic', 'professional', 'enterprise', 'clinic');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM ('active', 'suspended', 'cancelled', 'trial', 'past_due');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
    CREATE TYPE appointment_status AS ENUM (
      'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'pending', 'accepted'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reminder_channel') THEN
    CREATE TYPE reminder_channel AS ENUM ('whatsapp', 'email', 'both');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reminder_offset') THEN
    CREATE TYPE reminder_offset AS ENUM ('7d', '24h', '3h', '1h');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_source') THEN
    CREATE TYPE lead_source AS ENUM ('whatsapp','instagram','facebook','website','referral','manual');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE lead_status AS ENUM ('hot','cold','client','archived');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM ('pago_movil','transferencia','efectivo','zelle','otro');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('pending', 'verified', 'rejected');
  END IF;
END $$;


-- ─── 2. plan_configs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_configs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key     text NOT NULL UNIQUE,
  name         text NOT NULL,
  price        numeric DEFAULT 0,
  currency     text DEFAULT 'USD',
  trial_days   int DEFAULT 0,
  description  text,
  is_active    boolean DEFAULT true,
  sort_order   int DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;


-- ─── 3. plan_features ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_features (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan           text NOT NULL,
  feature_key    text NOT NULL,
  feature_label  text NOT NULL,
  enabled        boolean DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  CONSTRAINT plan_features_plan_feature_key_key UNIQUE (plan, feature_key)
);
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;


-- ─── 4. plan_promotions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_promotions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key            text NOT NULL,
  duration_months     int NOT NULL DEFAULT 3,
  original_price_usd  numeric NOT NULL,
  promo_price_usd     numeric NOT NULL,
  label               text,
  is_active           boolean DEFAULT true,
  starts_at           timestamptz DEFAULT now(),
  ends_at             timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_promotions_active
  ON public.plan_promotions(plan_key, is_active)
  WHERE is_active = true;
ALTER TABLE public.plan_promotions ENABLE ROW LEVEL SECURITY;


-- ─── 5. subscriptions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id             uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan                  subscription_plan NOT NULL DEFAULT 'trial',
  status                subscription_status NOT NULL DEFAULT 'trial',
  price_usd             numeric NOT NULL DEFAULT 0,
  billing_cycle         text DEFAULT 'monthly',
  current_period_start  timestamptz NOT NULL DEFAULT now(),
  current_period_end    timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  trial_ends_at         timestamptz DEFAULT (now() + interval '14 days'),
  cancelled_at          timestamptz,
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;


-- ─── 6. subscription_payments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id   uuid NOT NULL REFERENCES public.subscriptions(id),
  amount            numeric NOT NULL DEFAULT 20.00,
  currency          text DEFAULT 'USD',
  method            text DEFAULT 'pago_movil',
  reference_number  text,
  receipt_url       text,
  status            text DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  verified_by       uuid REFERENCES public.profiles(id),
  verified_at       timestamptz,
  rejection_reason  text,
  period_start      timestamptz,
  period_end        timestamptz,
  created_at        timestamptz DEFAULT now()
);
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;


-- ─── 7. reminders_settings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminders_settings (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id              uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled                boolean DEFAULT true,
  channel                reminder_channel DEFAULT 'both',
  reminder_7d_enabled    boolean DEFAULT true,
  reminder_24h_enabled   boolean DEFAULT true,
  reminder_3h_enabled    boolean DEFAULT true,
  reminder_1h_enabled    boolean DEFAULT false,
  template_7d_whatsapp   text DEFAULT 'Hola {patient_name}, te recordamos tu cita con el Dr. {doctor_name} el {date} a las {time}.',
  template_24h_whatsapp  text DEFAULT 'Hola {patient_name}, mañana tienes cita con el Dr. {doctor_name} a las {time}.',
  template_3h_whatsapp   text DEFAULT 'Hola {patient_name}, en 3 horas tienes cita con el Dr. {doctor_name}.',
  quiet_hours_start      time DEFAULT '21:00:00',
  quiet_hours_end        time DEFAULT '08:00:00',
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);
ALTER TABLE public.reminders_settings ENABLE ROW LEVEL SECURITY;


-- ─── 8. reminders_queue ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminders_queue (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id  uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  doctor_id       uuid NOT NULL REFERENCES public.profiles(id),
  patient_id      uuid REFERENCES public.profiles(id),
  offset_type     reminder_offset NOT NULL,
  scheduled_for   timestamptz NOT NULL,
  channel         reminder_channel NOT NULL,
  message_body    text,
  status          text DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped','cancelled')),
  attempts        int DEFAULT 0,
  last_attempt_at timestamptz,
  sent_at         timestamptz,
  error_message   text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_queue_appointment
  ON public.reminders_queue(appointment_id);

CREATE INDEX IF NOT EXISTS idx_reminders_queue_worker
  ON public.reminders_queue(scheduled_for, status)
  WHERE status = 'pending';

ALTER TABLE public.reminders_queue ENABLE ROW LEVEL SECURITY;


-- ─── 9. Policies (reflejan estado actual, endurecidas donde era USING true) ─
-- plan_configs
DROP POLICY IF EXISTS "Allow all for service role" ON public.plan_configs;
CREATE POLICY "Service role manages plan_configs" ON public.plan_configs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated reads plan_configs" ON public.plan_configs
  FOR SELECT TO authenticated USING (is_active = true);

-- plan_features: público lee features activas, super_admin modifica
DROP POLICY IF EXISTS "Admins can modify plan_features" ON public.plan_features;
DROP POLICY IF EXISTS "Authenticated users can read plan_features" ON public.plan_features;
CREATE POLICY "Authenticated reads plan_features" ON public.plan_features
  FOR SELECT TO authenticated USING (enabled = true);
CREATE POLICY "Super admin writes plan_features" ON public.plan_features
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role));

-- plan_promotions (ya están bien)
-- subscriptions, subscription_payments (ya están bien)

-- reminders_settings: doctor gestiona su propia configuración
DROP POLICY IF EXISTS "Doctor manages own reminders_settings" ON public.reminders_settings;
CREATE POLICY "Doctor manages own reminders_settings" ON public.reminders_settings
  FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

-- reminders_queue: doctor ve/gestiona sus propios; service_role gestiona todo
DROP POLICY IF EXISTS "Doctor sees own reminders_queue" ON public.reminders_queue;
CREATE POLICY "Doctor sees own reminders_queue" ON public.reminders_queue
  FOR SELECT TO authenticated USING (doctor_id = auth.uid());
DROP POLICY IF EXISTS "Service role manages reminders_queue" ON public.reminders_queue;
CREATE POLICY "Service role manages reminders_queue" ON public.reminders_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- FIN migration v24
-- ============================================================================
