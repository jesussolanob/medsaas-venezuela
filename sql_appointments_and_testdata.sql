-- ═══════════════════════════════════════════════════════════════
-- Delta Medical CRM — Tabla appointments + datos de prueba
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Agregar avatar_url a profiles (para foto del médico en booking page)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ─────────────────────────────────────────────────────────────────
-- 2. Tabla appointments (citas agendadas por pacientes via booking)
--    Flujo: pending → accepted (médico acepta) → completed / cancelled
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id       UUID REFERENCES patients(id) ON DELETE SET NULL,
  patient_name     TEXT NOT NULL,
  patient_phone    TEXT,
  patient_email    TEXT,
  appointment_date TIMESTAMPTZ NOT NULL,
  chief_complaint  TEXT,
  plan_name        TEXT DEFAULT 'Consulta General',
  plan_price       NUMERIC(10,2) DEFAULT 20,
  status           TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'accepted' | 'completed' | 'cancelled' | 'no_show'
  source           TEXT DEFAULT 'booking',   -- 'booking' | 'manual'
  consultation_id  UUID REFERENCES consultations(id) ON DELETE SET NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date   ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Médico ve sus citas" ON appointments;
CREATE POLICY "Médico ve sus citas" ON appointments
  FOR ALL USING (doctor_id = auth.uid());

-- Acceso anónimo para insertar citas desde el booking público
DROP POLICY IF EXISTS "Público puede crear cita" ON appointments;
CREATE POLICY "Público puede crear cita" ON appointments
  FOR INSERT WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════
-- 3. DATOS DE PRUEBA
--    Reemplaza 'TU_DOCTOR_UUID' con tu UUID de médico
--    Puedes encontrarlo en Supabase → Auth → Users, o ejecutar:
--    SELECT id FROM profiles WHERE email = 'tu@email.com';
-- ═══════════════════════════════════════════════════════════════

-- PASO 1: Obtén tu UUID ejecutando esto primero:
-- SELECT id FROM profiles LIMIT 5;
-- Luego copia el UUID y reemplaza en las sentencias de abajo.

-- ─────────────────────────────────────────────────────────────────
-- EJEMPLO (reemplaza el UUID con el tuyo):
-- ─────────────────────────────────────────────────────────────────
/*

-- Insertar pacientes de prueba
INSERT INTO patients (doctor_id, full_name, age, phone, email, sex, source)
VALUES
  ('TU_DOCTOR_UUID', 'María González', 35, '+584121234567', 'maria@email.com', 'female', 'manual'),
  ('TU_DOCTOR_UUID', 'Carlos Rodríguez', 42, '+584141234567', 'carlos@email.com', 'male', 'manual'),
  ('TU_DOCTOR_UUID', 'Ana Martínez', 28, '+584161234567', 'ana@email.com', 'female', 'booking'),
  ('TU_DOCTOR_UUID', 'Luis Pérez', 55, '+584261234567', null, 'male', 'manual')
ON CONFLICT DO NOTHING;

-- Insertar consultas de prueba (historial clínico)
INSERT INTO consultations (
  consultation_code, patient_id, doctor_id,
  chief_complaint, notes, diagnosis, treatment,
  payment_status, consultation_date
)
SELECT
  code, pid, 'TU_DOCTOR_UUID',
  complaint, note, diag, treat, pay_status, cdate
FROM (VALUES
  ('CON-20260101-1001',
   (SELECT id FROM patients WHERE doctor_id='TU_DOCTOR_UUID' AND full_name='María González' LIMIT 1),
   'Dolor de cabeza recurrente',
   'Paciente refiere dolor frontal que se presenta 3 veces por semana. Intensidad 7/10.',
   'Migraña episódica sin aura',
   'Ibuprofeno 400mg c/8h, reposo, hidratación. Control en 15 días.',
   'approved',
   NOW() - INTERVAL '45 days'
  ),
  ('CON-20260115-1002',
   (SELECT id FROM patients WHERE doctor_id='TU_DOCTOR_UUID' AND full_name='María González' LIMIT 1),
   'Control de migraña',
   'Mejora significativa. Frecuencia reducida a 1 vez por semana.',
   'Migraña en mejoría',
   'Continuar tratamiento. Agregar magnesio 400mg diario.',
   'approved',
   NOW() - INTERVAL '15 days'
  ),
  ('CON-20260201-1003',
   (SELECT id FROM patients WHERE doctor_id='TU_DOCTOR_UUID' AND full_name='Carlos Rodríguez' LIMIT 1),
   'Chequeo general',
   'Paciente asintomático. TA: 130/85. FC: 78 lpm. Peso: 88kg.',
   'HTA leve. Sobrepeso grado I.',
   'Losartan 50mg/día. Dieta hiposódica. Actividad física 30 min/día.',
   'pending_approval',
   NOW() - INTERVAL '10 days'
  ),
  ('CON-20260310-1004',
   (SELECT id FROM patients WHERE doctor_id='TU_DOCTOR_UUID' AND full_name='Ana Martínez' LIMIT 1),
   'Consulta por ansiedad',
   'Paciente con episodios de ansiedad desde hace 2 meses. Relacionados con estrés laboral.',
   'Trastorno de ansiedad generalizada leve',
   'Técnicas de relajación. Derivación a psicología. Control en 1 mes.',
   'unpaid',
   NOW() + INTERVAL '2 days'
  )
) AS t(code, pid, complaint, note, diag, treat, pay_status, cdate);

-- Insertar citas pendientes de aceptación (llegaron por booking)
INSERT INTO appointments (
  doctor_id, patient_name, patient_phone, patient_email,
  appointment_date, chief_complaint, plan_name, plan_price, status, source
)
VALUES
  ('TU_DOCTOR_UUID', 'Pedro Suárez', '+584161112233', 'pedro@email.com',
   NOW() + INTERVAL '2 days' + INTERVAL '9 hours',
   'Dolor lumbar crónico', 'Consulta General', 20, 'pending', 'booking'),
  ('TU_DOCTOR_UUID', 'Valentina Torres', '+584141234500', 'vale@email.com',
   NOW() + INTERVAL '3 days' + INTERVAL '10 hours',
   'Chequeo preventivo anual', 'Consulta Preventiva', 25, 'pending', 'booking'),
  ('TU_DOCTOR_UUID', 'Roberto Díaz', '+584261115566', null,
   NOW() + INTERVAL '5 days' + INTERVAL '14 hours',
   'Revisión de exámenes de sangre', 'Control', 15, 'pending', 'booking'),
  ('TU_DOCTOR_UUID', 'Elena Vargas', '+584121119988', 'elena@email.com',
   NOW() + INTERVAL '7 days' + INTERVAL '11 hours',
   'Consulta nutricional', 'Consulta Especializada', 30, 'accepted', 'booking');

*/

-- ═══════════════════════════════════════════════════════════════
-- INSTRUCCIONES DE USO:
-- 1. Copia el bloque dentro de /* ... */
-- 2. Reemplaza TODAS las ocurrencias de 'TU_DOCTOR_UUID' con tu UUID real
-- 3. Ejecuta en el SQL Editor de Supabase
-- ═══════════════════════════════════════════════════════════════
