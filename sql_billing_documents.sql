-- ═══════════════════════════════════════════════════════════════
-- Billing Documents Table
-- ═══════════════════════════════════════════════════════════════

-- Crear tabla billing_documents para trackear facturas, recibos, presupuestos
CREATE TABLE IF NOT EXISTS billing_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('factura', 'recibo', 'presupuesto')),
  consultation_id UUID REFERENCES consultations(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  patient_cedula TEXT,
  patient_email TEXT,
  doc_number TEXT NOT NULL UNIQUE,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'issued',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_documents_doctor ON billing_documents(doctor_id);
CREATE INDEX IF NOT EXISTS idx_billing_documents_doc_type ON billing_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_billing_documents_created ON billing_documents(created_at);
CREATE INDEX IF NOT EXISTS idx_billing_documents_consultation ON billing_documents(consultation_id);

-- RLS
ALTER TABLE billing_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctor manages their billing documents" ON billing_documents;
CREATE POLICY "Doctor manages their billing documents" ON billing_documents
  FOR ALL USING (doctor_id = auth.uid());

-- Adicionar columnas a appointments si no existen
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS plan_sessions_remaining INTEGER DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_phone_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

COMMENT ON TABLE billing_documents IS 'Registra todas las facturas, recibos y presupuestos generados por el médico';
