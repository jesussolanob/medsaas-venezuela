-- ═══════════════════════════════════════════════════════════════
-- MedSaaS Venezuela — Seed v2 (FIXED)
-- ═══════════════════════════════════════════════════════════════

-- 1. Columnas nuevas
ALTER TABLE patients       ADD COLUMN IF NOT EXISTS id_number TEXT;
ALTER TABLE profiles       ADD COLUMN IF NOT EXISTS payment_methods TEXT[];
ALTER TABLE consultations  ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE consultations  ADD COLUMN IF NOT EXISTS insurance_name TEXT;
ALTER TABLE consultations  ADD COLUMN IF NOT EXISTS insurance_auth_code TEXT;
ALTER TABLE consultations  ADD COLUMN IF NOT EXISTS amount NUMERIC;
ALTER TABLE appointments   ADD COLUMN IF NOT EXISTS patient_cedula TEXT;

-- 2. doctor_insurances
CREATE TABLE IF NOT EXISTS doctor_insurances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  credit_days INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doctor_insurances_doctor ON doctor_insurances(doctor_id);
ALTER TABLE doctor_insurances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctor manages their insurances" ON doctor_insurances;
CREATE POLICY "Doctor manages their insurances" ON doctor_insurances
  FOR ALL USING (doctor_id = auth.uid());

-- 3. leads — asegurar que tenga todas las columnas aunque ya exista
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS channel    TEXT DEFAULT 'whatsapp';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage      TEXT DEFAULT 'cold';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS message    TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_doctor ON leads(doctor_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage  ON leads(stage);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctor sees their leads" ON leads;
CREATE POLICY "Doctor sees their leads" ON leads
  FOR ALL USING (doctor_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════
-- SEED
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_doctor_id UUID;
  p1 UUID; p2 UUID; p3 UUID; p4 UUID; p5 UUID;
  p6 UUID; p7 UUID; p8 UUID; p9 UUID; pm UUID;
BEGIN
  SELECT id INTO v_doctor_id FROM profiles ORDER BY created_at LIMIT 1;
  IF v_doctor_id IS NULL THEN
    RAISE NOTICE 'No hay profile. Abortando seed.';
    RETURN;
  END IF;

  -- Pacientes (upsert por id_number)
  INSERT INTO patients (doctor_id, full_name, age, phone, id_number, email, sex, notes, source)
  VALUES
    (v_doctor_id,'Juan Pérez',45,'+58 412 111 2222','V-12345678','juan@email.com','male','Paciente desde 2025','manual'),
    (v_doctor_id,'Laura Hernández',38,'+58 414 333 4444','V-23456789','laura@email.com','female','Referido','manual'),
    (v_doctor_id,'Carlos Gómez',52,'+58 424 555 6666','V-34567890','carlos@email.com','male','Consultas recurrentes','manual'),
    (v_doctor_id,'Ana Rodríguez',41,'+58 416 777 8888','V-45678901','ana@email.com','female','Seguimiento','manual'),
    (v_doctor_id,'Isabel García',36,'+58 412 999 0000','V-56789012','isabel@email.com','female','Nueva paciente','manual'),
    (v_doctor_id,'Diego López',58,'+58 414 111 1111','V-67890123','diego@email.com','male','Paciente senior','manual'),
    (v_doctor_id,'Sofía Martínez',29,'+58 424 222 2222','V-78901234','sofia@email.com','female','Joven paciente','manual'),
    (v_doctor_id,'Roberto Flores',47,'+58 416 333 3333','V-89012345','roberto@email.com','male','Primera consulta','manual'),
    (v_doctor_id,'Martina Costa',33,'+58 412 444 4444','V-90123456','martina@email.com','female','Por agendar','manual'),
    (v_doctor_id,'María González',44,'+58 412 555 5555','V-01234567','maria@email.com','female','Paciente de largo plazo con historial','manual')
  ON CONFLICT DO NOTHING;

  SELECT id INTO p1 FROM patients WHERE doctor_id=v_doctor_id AND full_name='Juan Pérez'      LIMIT 1;
  SELECT id INTO p2 FROM patients WHERE doctor_id=v_doctor_id AND full_name='Laura Hernández' LIMIT 1;
  SELECT id INTO p3 FROM patients WHERE doctor_id=v_doctor_id AND full_name='Carlos Gómez'    LIMIT 1;
  SELECT id INTO p4 FROM patients WHERE doctor_id=v_doctor_id AND full_name='Ana Rodríguez'   LIMIT 1;
  SELECT id INTO p5 FROM patients WHERE doctor_id=v_doctor_id AND full_name='Isabel García'   LIMIT 1;
  SELECT id INTO p6 FROM patients WHERE doctor_id=v_doctor_id AND full_name='Diego López'     LIMIT 1;
  SELECT id INTO p7 FROM patients WHERE doctor_id=v_doctor_id AND full_name='Sofía Martínez'  LIMIT 1;
  SELECT id INTO p8 FROM patients WHERE doctor_id=v_doctor_id AND full_name='Roberto Flores'  LIMIT 1;
  SELECT id INTO p9 FROM patients WHERE doctor_id=v_doctor_id AND full_name='Martina Costa'   LIMIT 1;
  SELECT id INTO pm FROM patients WHERE doctor_id=v_doctor_id AND full_name='María González'  LIMIT 1;

  -- Citas (usar appointment_date como en tu schema original)
  INSERT INTO appointments (
    doctor_id, patient_id, patient_name, patient_phone, patient_email, patient_cedula,
    appointment_date, chief_complaint, plan_name, plan_price, status, source
  ) VALUES
    (v_doctor_id,p1,'Juan Pérez','+58 412 111 2222','juan@email.com','V-12345678',    NOW()+INTERVAL '2 days' +INTERVAL '9 hours',  'Dolor de cabeza','Consulta General',20,'pending','booking'),
    (v_doctor_id,p2,'Laura Hernández','+58 414 333 4444','laura@email.com','V-23456789', NOW()+INTERVAL '3 days' +INTERVAL '10 hours', 'Chequeo anual','Consulta General',20,'accepted','booking'),
    (v_doctor_id,p3,'Carlos Gómez','+58 424 555 6666','carlos@email.com','V-34567890', NOW()+INTERVAL '4 days' +INTERVAL '11 hours', 'Seguimiento diabetes','Consulta Especializada',40,'pending','booking'),
    (v_doctor_id,p4,'Ana Rodríguez','+58 416 777 8888','ana@email.com','V-45678901',    NOW()+INTERVAL '5 days' +INTERVAL '8 hours',  'Presión arterial','Consulta General',20,'accepted','booking'),
    (v_doctor_id,p5,'Isabel García','+58 412 999 0000','isabel@email.com','V-56789012', NOW()+INTERVAL '6 days' +INTERVAL '14 hours', 'Erupción cutánea','Consulta General',20,'pending','booking'),
    (v_doctor_id,p6,'Diego López','+58 414 111 1111','diego@email.com','V-67890123',    NOW()+INTERVAL '7 days' +INTERVAL '15 hours', 'Dolor de espalda','Consulta Especializada',40,'accepted','booking'),
    (v_doctor_id,p7,'Sofía Martínez','+58 424 222 2222','sofia@email.com','V-78901234', NOW()+INTERVAL '8 days' +INTERVAL '9 hours',  'Fatiga','Consulta General',20,'pending','booking'),
    (v_doctor_id,p8,'Roberto Flores','+58 416 333 3333','roberto@email.com','V-89012345',NOW()+INTERVAL '10 days'+INTERVAL '10 hours', 'Mareos','Consulta Especializada',40,'accepted','booking'),
    (v_doctor_id,p9,'Martina Costa','+58 412 444 4444','martina@email.com','V-90123456',NOW()+INTERVAL '12 days'+INTERVAL '11 hours', 'Alergia','Consulta General',20,'pending','booking'),
    (v_doctor_id,pm,'María González','+58 412 555 5555','maria@email.com','V-01234567', NOW()+INTERVAL '14 days'+INTERVAL '16 hours', 'Seguimiento crónico','Consulta General',20,'pending','booking')
  ON CONFLICT DO NOTHING;

  -- Consultas
  INSERT INTO consultations (
    doctor_id, patient_id, consultation_code, chief_complaint, notes, diagnosis, treatment,
    payment_status, payment_method, insurance_name, insurance_auth_code, amount, consultation_date
  ) VALUES
    (v_doctor_id,p1,'CON-20260401-1001','Cefalea tensional','Paciente reporta estrés laboral','Cefalea tipo tensional','Reposo, analgésicos','approved','cash_usd',NULL,NULL,20,NOW()-INTERVAL '30 days'),
    (v_doctor_id,p2,'CON-20260402-1002','Chequeo preventivo','Seguimiento anual','Sano','Recomendaciones generales','approved','pago_movil',NULL,NULL,20,NOW()-INTERVAL '25 days'),
    (v_doctor_id,p3,'CON-20260403-1003','Diabetes tipo 2','Glucosa elevada','Diabetes descompensada','Medicamentos ajustados','approved','insurance','Seguros Mercantil','AUTH-2026-001',20,NOW()-INTERVAL '20 days'),
    (v_doctor_id,p4,'CON-20260404-1004','Hipertensión','Presión 160/100','Hipertensión grado 2','Medicamentos, dieta','approved','transferencia',NULL,NULL,20,NOW()-INTERVAL '15 days'),
    (v_doctor_id,p5,'CON-20260405-1005','Dermatitis','Picazón generalizada','Alergia de contacto','Crema antialérgica','pending_approval','cash_usd',NULL,NULL,20,NOW()-INTERVAL '10 days'),
    (v_doctor_id,p6,'CON-20260406-1006','Lumbalgia','Dolor lumbar crónico','Lumbago crónico','Fisioterapia','approved','zelle',NULL,NULL,40,NOW()-INTERVAL '8 days'),
    (v_doctor_id,p7,'CON-20260407-1007','Astenia','Cansancio extremo','Síndrome de fatiga','Descanso, vitaminas','unpaid','insurance','Mapfre','AUTH-2026-002',20,NOW()-INTERVAL '5 days'),
    (v_doctor_id,p8,'CON-20260408-1008','Vértigo','Mareos posicionales','Vértigo postural','Maniobra Epley','approved','pago_movil',NULL,NULL,40,NOW()-INTERVAL '3 days'),
    (v_doctor_id,p9,'CON-20260409-1009','Rinitis alérgica','Estornudos, congestión','Alergia estacional','Antihistamínico','approved','cash_usd',NULL,NULL,20,NOW()-INTERVAL '2 days'),
    (v_doctor_id,pm,'CON-20260410-1010','Revisión crónica','Paciente regular','Hipertensión estable','Mantener medicamentos','approved','insurance','La Previsora','AUTH-2026-003',20,NOW()-INTERVAL '1 day')
  ON CONFLICT (consultation_code) DO NOTHING;

  -- Historial adicional de María
  INSERT INTO consultations (
    doctor_id, patient_id, consultation_code, chief_complaint, notes, diagnosis, treatment,
    payment_status, payment_method, insurance_name, amount, consultation_date
  ) VALUES
    (v_doctor_id,pm,'CON-20260301-2001','Chequeo semestral','Revisión de medicamentos','Hipertensión controlada','Mantener dosis','approved','insurance','La Previsora',20,NOW()-INTERVAL '60 days'),
    (v_doctor_id,pm,'CON-20260201-2002','Incremento de presión','Presión 150/95','Hipertensión grado 1','Aumento de medicamento','approved','insurance','La Previsora',20,NOW()-INTERVAL '90 days'),
    (v_doctor_id,pm,'CON-20260101-2003','Consulta inicial 2026','Evaluación integral','Hipertensión','Plan de tratamiento','approved','insurance','La Previsora',20,NOW()-INTERVAL '120 days')
  ON CONFLICT (consultation_code) DO NOTHING;

  -- Seguros del médico
  INSERT INTO doctor_insurances (doctor_id, name, credit_days, notes)
  SELECT v_doctor_id, x.name, x.days, x.notes
  FROM (VALUES
    ('Seguros Mercantil',10,'Requiere autorización previa. Pago en 10 días.'),
    ('Mapfre',15,'Plazo de pago flexible.'),
    ('La Previsora',30,'Pago mensual. Incluye copia de cédula.')
  ) AS x(name,days,notes)
  WHERE NOT EXISTS (
    SELECT 1 FROM doctor_insurances d WHERE d.doctor_id=v_doctor_id AND d.name=x.name
  );

  -- Métodos de pago
  UPDATE profiles
     SET payment_methods = ARRAY['pago_movil','transferencia','cash_usd','zelle']
   WHERE id = v_doctor_id
     AND (payment_methods IS NULL OR array_length(payment_methods,1) IS NULL);

  RAISE NOTICE 'Seed completado para doctor %', v_doctor_id;
END $$;
