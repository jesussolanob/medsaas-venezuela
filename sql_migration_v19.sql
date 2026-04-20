-- ============================================================================
-- MedSaaS Venezuela — Migration v19
-- Add payment_reference to consultations + ensure created_at exists
-- Two-date model: created_at = when record was created, consultation_date = actual consultation date
-- ============================================================================

-- 1. Add payment_reference column
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payment_reference TEXT;

-- 2. Add payment_method column (may not exist yet)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- 3. Add plan_name column (may not exist yet)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS plan_name TEXT;

-- 4. Add amount column (may not exist yet)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;

-- 5. Add currency column
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- 6. Ensure created_at exists with default NOW()
-- consultation_date = fecha real de la consulta (la que elige el médico)
-- created_at = fecha de creación del registro en el sistema
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 7. Ensure updated_at exists
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 8. Add birth_date to patients if not exists
ALTER TABLE patients ADD COLUMN IF NOT EXISTS birth_date DATE;

-- ============================================================================
-- Indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_consultations_created_at ON consultations(created_at);
CREATE INDEX IF NOT EXISTS idx_consultations_payment_status ON consultations(payment_status);
CREATE INDEX IF NOT EXISTS idx_consultations_plan_name ON consultations(plan_name);
