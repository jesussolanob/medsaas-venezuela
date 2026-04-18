-- ============================================================================
-- MedSaaS Venezuela — Migration v17
-- Disponibilidad del médico + configuración de duración de citas
-- ============================================================================

-- 1. Configuración de agenda del médico
CREATE TABLE IF NOT EXISTS doctor_schedule_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slot_duration INT NOT NULL DEFAULT 30,       -- duración de cita en minutos (15, 20, 30, 45, 60)
  buffer_minutes INT NOT NULL DEFAULT 0,       -- tiempo entre citas en minutos (0, 5, 10, 15)
  advance_booking_days INT DEFAULT 30,         -- hasta cuántos días en el futuro se puede agendar
  auto_approve BOOLEAN DEFAULT false,          -- aprobar citas automáticamente
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id)
);

-- 2. Bloques de disponibilidad semanal
CREATE TABLE IF NOT EXISTS doctor_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Lunes, 6=Domingo
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- 3. Bloqueos específicos (vacaciones, feriados, ausencias)
CREATE TABLE IF NOT EXISTS doctor_blocked_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  start_time TIME,            -- NULL = día completo bloqueado
  end_time TIME,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_schedule_config_doctor ON doctor_schedule_config(doctor_id);
CREATE INDEX IF NOT EXISTS idx_availability_doctor ON doctor_availability(doctor_id);
CREATE INDEX IF NOT EXISTS idx_availability_day ON doctor_availability(doctor_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_blocked_doctor ON doctor_blocked_slots(doctor_id);
CREATE INDEX IF NOT EXISTS idx_blocked_date ON doctor_blocked_slots(doctor_id, blocked_date);

-- RLS
ALTER TABLE doctor_schedule_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_blocked_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctor manages own schedule config" ON doctor_schedule_config
  FOR ALL USING (doctor_id = auth.uid());
CREATE POLICY "Doctor manages own availability" ON doctor_availability
  FOR ALL USING (doctor_id = auth.uid());
CREATE POLICY "Doctor manages own blocked slots" ON doctor_blocked_slots
  FOR ALL USING (doctor_id = auth.uid());

-- Allow public read for booking page
CREATE POLICY "Public reads availability" ON doctor_availability
  FOR SELECT USING (true);
CREATE POLICY "Public reads schedule config" ON doctor_schedule_config
  FOR SELECT USING (true);
CREATE POLICY "Public reads blocked slots" ON doctor_blocked_slots
  FOR SELECT USING (true);
