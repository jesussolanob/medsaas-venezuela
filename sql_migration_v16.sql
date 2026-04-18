-- ============================================================================
-- MedSaaS Venezuela — Migration v16
-- Cadena completa: Cita → Consulta → Pago → Factura
-- Optimizada para millones de registros
-- ============================================================================

-- 1. appointment_code en appointments (código legible para el paciente)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_code TEXT UNIQUE;

-- Generar códigos para citas existentes sin código
UPDATE appointments
SET appointment_code = 'CIT-' || TO_CHAR(created_at, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9999)::TEXT, 4, '0')
WHERE appointment_code IS NULL;

-- Índice para búsqueda rápida por código
CREATE INDEX IF NOT EXISTS idx_appointments_code ON appointments(appointment_code);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_status ON appointments(doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled ON appointments(scheduled_at);

-- 2. Enlazar consultations con appointments
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- Índices para consultas de alto volumen
CREATE INDEX IF NOT EXISTS idx_consultations_doctor_date ON consultations(doctor_id, consultation_date DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_appointment ON consultations(appointment_id);
CREATE INDEX IF NOT EXISTS idx_consultations_code ON consultations(consultation_code);

-- 3. Tabla de pagos paciente→doctor (para cada consulta)
CREATE TABLE IF NOT EXISTS consultation_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES profiles(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  payment_method TEXT NOT NULL, -- 'pago_movil', 'transferencia', 'zelle', 'binance', 'efectivo_usd', 'efectivo_bs', 'pos', 'seguro'
  reference_number TEXT,
  receipt_url TEXT,             -- comprobante subido por paciente
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE consultation_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctor manages own payments" ON consultation_payments;
CREATE POLICY "Doctor manages own payments" ON consultation_payments
  FOR ALL USING (
    doctor_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE auth_user_id = auth.uid())
  );

-- Índices para pagos de alto volumen
CREATE INDEX IF NOT EXISTS idx_cpayments_consultation ON consultation_payments(consultation_id);
CREATE INDEX IF NOT EXISTS idx_cpayments_doctor ON consultation_payments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_cpayments_patient ON consultation_payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_cpayments_status ON consultation_payments(status);
CREATE INDEX IF NOT EXISTS idx_cpayments_created ON consultation_payments(created_at DESC);

-- 4. Tabla de facturas doctor→paciente (billing_documents mejorada)
-- billing_documents ya existe, agregar campos faltantes
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS consultation_id UUID REFERENCES consultations(id);
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES consultation_payments(id);
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id);
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS bcv_rate NUMERIC;
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS total_bs NUMERIC;
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS iva_amount NUMERIC DEFAULT 0;
ALTER TABLE billing_documents ADD COLUMN IF NOT EXISTS igtf_amount NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_billing_doctor ON billing_documents(doctor_id);
CREATE INDEX IF NOT EXISTS idx_billing_consultation ON billing_documents(consultation_id);
CREATE INDEX IF NOT EXISTS idx_billing_patient ON billing_documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_billing_created ON billing_documents(created_at DESC);

-- 5. Índices adicionales para tablas existentes de alto volumen
CREATE INDEX IF NOT EXISTS idx_patients_doctor ON patients(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patients_auth ON patients(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_consultation ON prescriptions(consultation_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_leads_doctor ON leads(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patient_messages_patient ON patient_messages(patient_id);

-- 6. Función para generar appointment_code automáticamente
CREATE OR REPLACE FUNCTION generate_appointment_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.appointment_code IS NULL THEN
    NEW.appointment_code := 'CIT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9999)::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appointment_code ON appointments;
CREATE TRIGGER trg_appointment_code
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION generate_appointment_code();

-- 7. Función para actualizar payment_status en consultations cuando se aprueba pago
CREATE OR REPLACE FUNCTION sync_consultation_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE consultations SET payment_status = 'approved', updated_at = NOW()
    WHERE id = NEW.consultation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_payment_status ON consultation_payments;
CREATE TRIGGER trg_sync_payment_status
  AFTER INSERT OR UPDATE ON consultation_payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_consultation_payment_status();

-- 8. Vista para dashboard del doctor (evita N+1 queries)
CREATE OR REPLACE VIEW doctor_consultation_summary AS
SELECT
  c.id,
  c.consultation_code,
  c.consultation_date,
  c.chief_complaint,
  c.diagnosis,
  c.treatment,
  c.payment_status,
  c.amount,
  c.doctor_id,
  c.patient_id,
  c.appointment_id,
  p.full_name AS patient_name,
  p.phone AS patient_phone,
  p.email AS patient_email,
  a.appointment_code,
  a.scheduled_at AS appointment_date,
  cp.id AS payment_id,
  cp.payment_method,
  cp.reference_number AS payment_reference,
  cp.status AS payment_approval_status,
  bd.doc_number AS invoice_number,
  bd.id AS invoice_id
FROM consultations c
LEFT JOIN patients p ON p.id = c.patient_id
LEFT JOIN appointments a ON a.id = c.appointment_id
LEFT JOIN consultation_payments cp ON cp.consultation_id = c.id AND cp.status != 'rejected'
LEFT JOIN billing_documents bd ON bd.consultation_id = c.id AND bd.doc_type = 'factura';
