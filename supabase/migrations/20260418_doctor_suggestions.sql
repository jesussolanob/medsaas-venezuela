-- Doctor suggestions / feedback table
CREATE TABLE IF NOT EXISTS doctor_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('feature', 'bug', 'improvement', 'general')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
  admin_response TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE doctor_suggestions ENABLE ROW LEVEL SECURITY;

-- Doctors can read their own suggestions
CREATE POLICY "Doctors can read own suggestions" ON doctor_suggestions
  FOR SELECT USING (doctor_id = auth.uid());

-- Doctors can insert their own suggestions
CREATE POLICY "Doctors can insert own suggestions" ON doctor_suggestions
  FOR INSERT WITH CHECK (doctor_id = auth.uid());

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_doctor_suggestions_doctor ON doctor_suggestions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_suggestions_status ON doctor_suggestions(status);
