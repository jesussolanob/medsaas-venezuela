-- Plan Promotions table
-- Allows admin to configure multi-month discounts for subscription plans
CREATE TABLE IF NOT EXISTS plan_promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_key TEXT NOT NULL REFERENCES plan_configs(plan_key) ON DELETE CASCADE,
  duration_months INTEGER NOT NULL DEFAULT 3,
  original_price_usd NUMERIC(10,2) NOT NULL,
  promo_price_usd NUMERIC(10,2) NOT NULL,
  label TEXT, -- e.g. "Oferta 3 meses"
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookup of active promotions
CREATE INDEX IF NOT EXISTS idx_plan_promotions_active ON plan_promotions(plan_key, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE plan_promotions ENABLE ROW LEVEL SECURITY;

-- Public read for active promotions (landing page needs this)
CREATE POLICY "Public can view active promotions"
  ON plan_promotions FOR SELECT
  USING (is_active = true AND (ends_at IS NULL OR ends_at > now()));

-- Service role full access
CREATE POLICY "Service role full access to promotions"
  ON plan_promotions
  USING (true)
  WITH CHECK (true);
