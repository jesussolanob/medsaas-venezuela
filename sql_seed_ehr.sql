-- ═══════════════════════════════════════════════════════════════
-- EHR Seed — 3 nuevos pacientes + 9 consultas + prescriptions
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_doctor_id UUID;
  p_pedro UUID;
  p_lucia UUID;
  p_andres UUID;
BEGIN
  -- Obtener primer médico
  SELECT id INTO v_doctor_id FROM profiles ORDER BY created_at LIMIT 1;
  IF v_doctor_id IS NULL THEN
    RAISE NOTICE 'No doctor found. Aborting EHR seed.';
    RETURN;
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 1. Crear 3 nuevos pacientes
  -- ═══════════════════════════════════════════════════════════════
  INSERT INTO patients (doctor_id, full_name, age, phone, id_number, email, sex, notes, source)
  VALUES
    (v_doctor_id, 'Pedro Ramírez', 52, '+58 412 123 4567', 'V-10234567', 'pedro.ramirez@email.com', 'male', 'Paciente de 52 años con antecedentes de hipertensión', 'manual'),
    (v_doctor_id, 'Lucía Márquez', 38, '+58 414 234 5678', 'V-20345678', 'lucia.marquez@email.com', 'female', 'Paciente de 38 años, sin comorbilidades conocidas', 'manual'),
    (v_doctor_id, 'Andrés Rivas', 45, '+58 424 345 6789', 'V-30456789', 'andres.rivas@email.com', 'male', 'Paciente de 45 años, consultor con estrés ocupacional', 'manual')
  ON CONFLICT (id_number) DO NOTHING;

  -- Obtener IDs de los pacientes insertados
  SELECT id INTO p_pedro FROM patients WHERE doctor_id = v_doctor_id AND id_number = 'V-10234567' LIMIT 1;
  SELECT id INTO p_lucia FROM patients WHERE doctor_id = v_doctor_id AND id_number = 'V-20345678' LIMIT 1;
  SELECT id INTO p_andres FROM patients WHERE doctor_id = v_doctor_id AND id_number = 'V-30456789' LIMIT 1;

  -- ═══════════════════════════════════════════════════════════════
  -- 2. Crear 9 consultas (3 por paciente)
  -- ═══════════════════════════════════════════════════════════════

  -- PEDRO RAMÍREZ (3 consultas)
  INSERT INTO consultations (
    doctor_id, patient_id, consultation_code, chief_complaint, notes, diagnosis, treatment,
    payment_status, payment_method, amount, consultation_date
  ) VALUES
    (v_doctor_id, p_pedro, 'CON-20260101-3001', 'Hipertensión descontrolada',
     'Paciente refiere PA elevada desde hace una semana, refiere estrés laboral',
     'Hipertensión arterial grado 2 descompensada',
     'Lisinopril 10mg + Hidroclorotiazida 25mg, reposo, dieta sin sal',
     'approved', 'pago_movil', 50, NOW() - INTERVAL '120 days'),
    (v_doctor_id, p_pedro, 'CON-20260201-3002', 'Seguimiento hipertensión',
     'Control de PA: 145/92. Paciente refiere mejor adherencia al tratamiento',
     'Hipertensión grado 1 controlada',
     'Mantener Lisinopril 10mg, Hidroclorotiazida 25mg. Ejercicio moderado',
     'approved', 'transferencia', 50, NOW() - INTERVAL '90 days'),
    (v_doctor_id, p_pedro, 'CON-20260301-3003', 'Dolor de pecho atípico',
     'Dolor leve en hemitórax izquierdo, sin radiación, probable musculoesquelético',
     'Dolor musculoesquelético de tórax',
     'Dipirona 500mg c/6h, relajante muscular, seguimiento',
     'approved', 'cash_usd', 50, NOW() - INTERVAL '30 days');

  -- LUCÍA MÁRQUEZ (3 consultas)
  INSERT INTO consultations (
    doctor_id, patient_id, consultation_code, chief_complaint, notes, diagnosis, treatment,
    payment_status, payment_method, amount, consultation_date
  ) VALUES
    (v_doctor_id, p_lucia, 'CON-20260102-3004', 'Gastritis aguda',
     'Paciente refiere dolor epigástrico, pirosis, sin náuseas. Probable por estrés',
     'Gastritis aguda no erosiva',
     'Omeprazol 20mg c/12h, dieta blanda, evitar irritantes',
     'approved', 'insurance', 40, NOW() - INTERVAL '110 days'),
    (v_doctor_id, p_lucia, 'CON-20260202-3005', 'Síndrome de colon irritable',
     'Cambios en hábitos intestinales, distensión abdominal leve',
     'Síndrome de colon irritable tipo diarreico',
     'Dieta con fibra, hidratación, Ranitidina PRN, evaluación nutricional',
     'approved', 'pago_movil', 40, NOW() - INTERVAL '60 days'),
    (v_doctor_id, p_lucia, 'CON-20260302-3006', 'Control preventivo',
     'Revisión de peso, presión, laboratorios normales',
     'Revisión de salud sin hallazgos patológicos',
     'Continuar con hábitos saludables, próximo chequeo en 6 meses',
     'approved', 'cash_usd', 30, NOW() - INTERVAL '15 days');

  -- ANDRÉS RIVAS (3 consultas)
  INSERT INTO consultations (
    doctor_id, patient_id, consultation_code, chief_complaint, notes, diagnosis, treatment,
    payment_status, payment_method, amount, consultation_date
  ) VALUES
    (v_doctor_id, p_andres, 'CON-20260103-3007', 'Estrés y ansiedad',
     'Síntomas de estrés laboral, dificultad para dormir, sensación de opresión en pecho',
     'Trastorno de ansiedad secundario a estrés ocupacional',
     'Lorazepam 0.5mg PRN, técnicas de relajación, consideración de psicoterapia',
     'approved', 'cash_usd', 45, NOW() - INTERVAL '100 days'),
    (v_doctor_id, p_andres, 'CON-20260203-3008', 'Insomnio crónico',
     'Paciente refiere dificultad de conciliación del sueño por más de 3 meses',
     'Insomnio primario crónico',
     'Melatonina 3mg al acostarse, higiene del sueño, evitar pantallas 1h antes',
     'approved', 'transferencia', 45, NOW() - INTERVAL '50 days'),
    (v_doctor_id, p_andres, 'CON-20260303-3009', 'Cefalea tensional crónica',
     'Dolor occipital bilateral, peor con estrés, no acompañado de náuseas',
     'Cefalea tipo tensional crónica',
     'Paracetamol 500mg PRN, relajantes musculares, yoga, referencia a fisioterapia',
     'approved', 'pago_movil', 40, NOW() - INTERVAL '7 days');

  -- ═══════════════════════════════════════════════════════════════
  -- 3. Crear prescriptions (recetas médicas)
  -- ═══════════════════════════════════════════════════════════════

  -- Asegurar que la tabla exists
  CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    consultation_id UUID REFERENCES consultations(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    medication TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT,
    duration TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id);
  CREATE INDEX IF NOT EXISTS idx_prescriptions_consultation ON prescriptions(consultation_id);
  CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);

  ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Doctor manages prescriptions" ON prescriptions;
  CREATE POLICY "Doctor manages prescriptions" ON prescriptions
    FOR ALL USING (doctor_id = auth.uid());

  -- Recetas para Pedro
  INSERT INTO prescriptions (doctor_id, consultation_id, patient_id, medication, dosage, frequency, duration, notes)
  VALUES
    (v_doctor_id, (SELECT id FROM consultations WHERE doctor_id=v_doctor_id AND consultation_code='CON-20260101-3001' LIMIT 1), p_pedro, 'Lisinopril', '10 mg', 'Una vez al día', '30 días', 'Tomar en la mañana, sin alimentos'),
    (v_doctor_id, (SELECT id FROM consultations WHERE doctor_id=v_doctor_id AND consultation_code='CON-20260101-3001' LIMIT 1), p_pedro, 'Hidroclorotiazida', '25 mg', 'Una vez al día', '30 días', 'Tomar a la mañana, puede aumentar micción');

  -- Recetas para Lucía
  INSERT INTO prescriptions (doctor_id, consultation_id, patient_id, medication, dosage, frequency, duration, notes)
  VALUES
    (v_doctor_id, (SELECT id FROM consultations WHERE doctor_id=v_doctor_id AND consultation_code='CON-20260102-3004' LIMIT 1), p_lucia, 'Omeprazol', '20 mg', 'Cada 12 horas', '21 días', 'Tomar 30 min antes de las comidas'),
    (v_doctor_id, (SELECT id FROM consultations WHERE doctor_id=v_doctor_id AND consultation_code='CON-20260202-3005' LIMIT 1), p_lucia, 'Ranitidina', '150 mg', 'Según sea necesario', 'PRN', 'Máximo 2 veces al día');

  -- Recetas para Andrés
  INSERT INTO prescriptions (doctor_id, consultation_id, patient_id, medication, dosage, frequency, duration, notes)
  VALUES
    (v_doctor_id, (SELECT id FROM consultations WHERE doctor_id=v_doctor_id AND consultation_code='CON-20260103-3007' LIMIT 1), p_andres, 'Lorazepam', '0.5 mg', 'Según sea necesario', 'PRN', 'No exceder 2 mg diarios'),
    (v_doctor_id, (SELECT id FROM consultations WHERE doctor_id=v_doctor_id AND consultation_code='CON-20260203-3008' LIMIT 1), p_andres, 'Melatonina', '3 mg', 'Una vez al acostarse', '30 días', 'Tomar 30 min antes de dormir'),
    (v_doctor_id, (SELECT id FROM consultations WHERE doctor_id=v_doctor_id AND consultation_code='CON-20260303-3009' LIMIT 1), p_andres, 'Paracetamol', '500 mg', 'Según sea necesario', 'PRN', 'No exceder 3 gramos diarios');

  RAISE NOTICE 'EHR seed completado: 3 pacientes, 9 consultas, % prescriptions creadas',
    (SELECT COUNT(*) FROM prescriptions WHERE doctor_id = v_doctor_id AND created_at > NOW() - INTERVAL '1 minute');

END $$;
