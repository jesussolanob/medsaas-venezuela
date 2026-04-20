-- Migration v22: Add bcv_rate to appointments and consultations
-- Stores the BCV exchange rate at the time of creation for Bs calculations

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS bcv_rate NUMERIC;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS bcv_rate NUMERIC;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS amount_bs NUMERIC;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS amount_bs NUMERIC;
