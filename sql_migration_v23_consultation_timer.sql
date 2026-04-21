-- Migration: Add consultation timer fields
-- Tracks when a consultation was started and ended, plus computed duration

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
