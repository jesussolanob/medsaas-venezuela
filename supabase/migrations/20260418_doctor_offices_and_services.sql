-- Doctor offices table
CREATE TABLE IF NOT EXISTS doctor_offices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  schedule JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for doctor_offices
ALTER TABLE doctor_offices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own offices" ON doctor_offices
  FOR ALL USING (doctor_id = auth.uid());

-- Add new columns to pricing_plans if they don't exist
DO $$ BEGIN
  ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS show_in_booking BOOLEAN DEFAULT true;
  ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
  ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'plan';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
