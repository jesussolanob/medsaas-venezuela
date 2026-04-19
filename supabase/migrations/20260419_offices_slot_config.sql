-- Add slot_duration and buffer_minutes to doctor_offices
ALTER TABLE doctor_offices ADD COLUMN IF NOT EXISTS slot_duration INTEGER DEFAULT 30;
ALTER TABLE doctor_offices ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER DEFAULT 10;

-- Allow public read access to doctor_offices for booking page
CREATE POLICY "Public can read active offices" ON doctor_offices
  FOR SELECT USING (is_active = true);
