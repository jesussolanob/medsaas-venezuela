-- @allow-write
-- PASO 6c — UNIQUE sin funciones en predicate (usando enum directamente)

-- Diagnóstico: ¿qué operadores/funciones causan el problema?
-- En enum status::text no es IMMUTABLE en predicate. Usamos enum directamente.

-- Patients: unique por (doctor_id, email) donde email no sea vacío.
-- Sin LOWER ni TRIM: eso se maneja en la app. Aquí solo prevenimos duplicados exactos.
CREATE UNIQUE INDEX IF NOT EXISTS patients_doctor_email_uq
  ON patients(doctor_id, email)
  WHERE email IS NOT NULL;

-- Appointments: unique por (doctor_id, scheduled_at) en estados activos.
-- Usamos enum directamente sin cast.
DO $$
DECLARE v_dup int;
BEGIN
  SELECT COUNT(*) INTO v_dup FROM (
    SELECT doctor_id, scheduled_at
    FROM appointments
    WHERE status IN ('scheduled','confirmed','pending','accepted')
    GROUP BY doctor_id, scheduled_at
    HAVING COUNT(*) > 1
  ) t;

  IF v_dup = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_uq
      ON appointments(doctor_id, scheduled_at)
      WHERE status IN ('scheduled','confirmed','pending','accepted');
    RAISE NOTICE '✅ appointments_doctor_slot_uq creada';
  ELSE
    RAISE NOTICE '⚠️ % duplicados existentes — no se crea', v_dup;
  END IF;
END $$;

SELECT 'V1_unique_indexes' AS section,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN ('patients_doctor_email_uq','appointments_doctor_slot_uq');
