-- Doctor templates table for PDF customization
CREATE TABLE IF NOT EXISTS doctor_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL, -- 'informe', 'recipe', 'prescripciones', 'reposo'
  logo_url TEXT,
  signature_url TEXT,
  font_family TEXT DEFAULT 'Inter',
  header_text TEXT DEFAULT '',
  footer_text TEXT DEFAULT '',
  show_logo BOOLEAN DEFAULT true,
  show_signature BOOLEAN DEFAULT true,
  primary_color TEXT DEFAULT '#0891b2',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(doctor_id, template_type)
);

-- RLS
ALTER TABLE doctor_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own templates" ON doctor_templates
  FOR ALL USING (doctor_id = auth.uid());
