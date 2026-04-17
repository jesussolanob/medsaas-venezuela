-- =============================================
-- MIGRATION V12: Doctor Services Module
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Create doctor_services table
CREATE TABLE IF NOT EXISTS doctor_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_usd NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE doctor_services ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS policies
DROP POLICY IF EXISTS "Doctor manages services" ON doctor_services;
CREATE POLICY "Doctor manages services" ON doctor_services
  FOR ALL USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Doctor inserts services" ON doctor_services;
CREATE POLICY "Doctor inserts services" ON doctor_services
  FOR INSERT WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_doctor_services_doctor_id ON doctor_services(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_services_is_active ON doctor_services(is_active);

-- Done!
-- New table: doctor_services
