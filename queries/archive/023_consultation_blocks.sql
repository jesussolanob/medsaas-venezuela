-- @allow-write
-- Actualización 2 — Plantillas multi-especialidad
-- Opción A: catálogo maestro + activación/renombrado por doctor

-- ─── 1. Catálogo maestro ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consultation_block_catalog (
  key                       text PRIMARY KEY,
  default_label             text NOT NULL,
  default_content_type      text NOT NULL DEFAULT 'rich_text'
                              CHECK (default_content_type IN
                                ('rich_text','list','date','file','structured','numeric')),
  default_printable         boolean DEFAULT true,
  default_send_to_patient   boolean DEFAULT true,
  description               text,
  created_at                timestamptz DEFAULT now()
);
ALTER TABLE public.consultation_block_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads catalog" ON public.consultation_block_catalog;
CREATE POLICY "Anyone reads catalog" ON public.consultation_block_catalog
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Super admin writes catalog" ON public.consultation_block_catalog;
CREATE POLICY "Super admin writes catalog" ON public.consultation_block_catalog
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role));

-- ─── 2. Config por doctor ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.doctor_consultation_blocks (
  doctor_id           uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  block_key           text REFERENCES public.consultation_block_catalog(key) ON DELETE CASCADE,
  custom_label        text,
  custom_content_type text,
  enabled             boolean DEFAULT true,
  sort_order          int DEFAULT 0,
  printable           boolean,
  send_to_patient     boolean,
  updated_at          timestamptz DEFAULT now(),
  PRIMARY KEY (doctor_id, block_key)
);
ALTER TABLE public.doctor_consultation_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor manages own blocks" ON public.doctor_consultation_blocks;
CREATE POLICY "Doctor manages own blocks" ON public.doctor_consultation_blocks
  FOR ALL TO authenticated
  USING (doctor_id = auth.uid() OR
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role))
  WITH CHECK (doctor_id = auth.uid() OR
              EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'::user_role));

-- Para que el paciente pueda ver bloques del doctor al renderizar su informe
DROP POLICY IF EXISTS "Authenticated reads doctor blocks" ON public.doctor_consultation_blocks;
CREATE POLICY "Authenticated reads doctor blocks" ON public.doctor_consultation_blocks
  FOR SELECT TO authenticated USING (true);

-- ─── 3. Defaults por especialidad (base) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.specialty_default_blocks (
  specialty     text,
  block_key     text REFERENCES public.consultation_block_catalog(key),
  enabled       boolean DEFAULT true,
  sort_order    int DEFAULT 0,
  PRIMARY KEY (specialty, block_key)
);
ALTER TABLE public.specialty_default_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone reads specialty defaults" ON public.specialty_default_blocks;
CREATE POLICY "Anyone reads specialty defaults" ON public.specialty_default_blocks
  FOR SELECT USING (true);

-- ─── 4. Snapshot inmutable en consultations ───────────────────────────────
ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS blocks_snapshot jsonb;

-- ─── 5. Seed: catálogo maestro ────────────────────────────────────────────
INSERT INTO consultation_block_catalog (key, default_label, default_content_type, description) VALUES
  ('chief_complaint',     'Motivo de consulta',   'rich_text', 'Lo que trae al paciente'),
  ('history',             'Antecedentes',         'rich_text', 'Historia clínica del paciente'),
  ('physical_exam',       'Examen físico',        'rich_text', 'Hallazgos del examen físico'),
  ('diagnosis',           'Diagnóstico',          'rich_text', 'Impresión diagnóstica'),
  ('treatment',           'Tratamiento',          'rich_text', 'Plan terapéutico general'),
  ('prescription',        'Prescripción',         'structured','Medicamentos recetados'),
  ('rest',                'Reposo',               'rich_text', 'Indicación de reposo'),
  ('tasks',               'Tareas terapéuticas',  'rich_text', 'Tareas para el paciente (usado en psicología)'),
  ('nutrition_plan',      'Plan alimenticio',     'rich_text', 'Guía nutricional personalizada'),
  ('exercises',           'Ejercicios',           'rich_text', 'Rutina de ejercicios (fisioterapia)'),
  ('indications',         'Indicaciones',         'rich_text', 'Indicaciones generales'),
  ('recommendations',     'Recomendaciones',      'rich_text', 'Recomendaciones complementarias'),
  ('requested_exams',     'Exámenes solicitados', 'list',      'Exámenes a realizar'),
  ('next_followup',       'Próximo control',      'date',      'Fecha de seguimiento'),
  ('internal_notes',      'Notas internas',       'rich_text', 'Solo para el doctor (no se imprime)')
ON CONFLICT (key) DO UPDATE SET
  default_label = EXCLUDED.default_label,
  description   = EXCLUDED.description;

-- Ajustar bloques que NO se imprimen / envían
UPDATE consultation_block_catalog
  SET default_printable = false, default_send_to_patient = false
  WHERE key = 'internal_notes';

-- ─── 6. Seed: defaults por especialidad ───────────────────────────────────
-- Estrategia: insertamos pares (specialty, block_key, sort_order) solo si no existen
INSERT INTO specialty_default_blocks (specialty, block_key, enabled, sort_order) VALUES
  -- Medicina General / Medicina Interna / Pediatría → flujo clásico
  ('Medicina General',    'chief_complaint', true, 1),
  ('Medicina General',    'physical_exam',   true, 2),
  ('Medicina General',    'diagnosis',       true, 3),
  ('Medicina General',    'treatment',       true, 4),
  ('Medicina General',    'prescription',    true, 5),
  ('Medicina General',    'rest',            true, 6),
  ('Medicina General',    'indications',     true, 7),
  ('Medicina General',    'next_followup',   true, 8),

  ('Medicina Interna',    'chief_complaint', true, 1),
  ('Medicina Interna',    'history',         true, 2),
  ('Medicina Interna',    'physical_exam',   true, 3),
  ('Medicina Interna',    'diagnosis',       true, 4),
  ('Medicina Interna',    'requested_exams', true, 5),
  ('Medicina Interna',    'prescription',    true, 6),
  ('Medicina Interna',    'next_followup',   true, 7),

  ('Pediatría',           'chief_complaint', true, 1),
  ('Pediatría',           'physical_exam',   true, 2),
  ('Pediatría',           'diagnosis',       true, 3),
  ('Pediatría',           'prescription',    true, 4),
  ('Pediatría',           'indications',     true, 5),
  ('Pediatría',           'next_followup',   true, 6),

  -- Psicología → sin prescripción, con tareas
  ('Psicología',          'chief_complaint', true, 1),
  ('Psicología',          'history',         true, 2),
  ('Psicología',          'tasks',           true, 3),
  ('Psicología',          'recommendations', true, 4),
  ('Psicología',          'internal_notes',  true, 5),
  ('Psicología',          'next_followup',   true, 6),

  -- Psiquiatría → con prescripción y tareas
  ('Psiquiatría',         'chief_complaint', true, 1),
  ('Psiquiatría',         'history',         true, 2),
  ('Psiquiatría',         'diagnosis',       true, 3),
  ('Psiquiatría',         'prescription',    true, 4),
  ('Psiquiatría',         'tasks',           true, 5),
  ('Psiquiatría',         'next_followup',   true, 6),

  -- Nutrición → plan alimenticio en lugar de prescripción
  ('Nutrición',           'chief_complaint', true, 1),
  ('Nutrición',           'history',         true, 2),
  ('Nutrición',           'nutrition_plan',  true, 3),
  ('Nutrición',           'recommendations', true, 4),
  ('Nutrición',           'next_followup',   true, 5),

  -- Fisioterapia → ejercicios en lugar de prescripción
  ('Fisioterapia',        'chief_complaint', true, 1),
  ('Fisioterapia',        'physical_exam',   true, 2),
  ('Fisioterapia',        'exercises',       true, 3),
  ('Fisioterapia',        'rest',            true, 4),
  ('Fisioterapia',        'indications',     true, 5),
  ('Fisioterapia',        'next_followup',   true, 6)
ON CONFLICT (specialty, block_key) DO NOTHING;

-- ─── Verificación ─────────────────────────────────────────────────────────
SELECT 'catalog_count' AS section, COUNT(*) AS n FROM consultation_block_catalog;
SELECT 'specialty_defaults_count' AS section, COUNT(*) AS n FROM specialty_default_blocks;
SELECT 'specialties_with_defaults' AS section, COUNT(DISTINCT specialty) AS n FROM specialty_default_blocks;
