-- @allow-write
-- PASO 6 — Constraints UNIQUE preventivos
-- Previene duplicados futuros detectados como vectores de bug.

-- Unicidad: un paciente por (doctor, email normalizado)
CREATE UNIQUE INDEX IF NOT EXISTS patients_doctor_email_uq
  ON patients(doctor_id, LOWER(TRIM(email)))
  WHERE email IS NOT NULL AND email <> '';

-- Unicidad: slot exacto por doctor (solo citas activas)
-- Nota: permite 'cancelled' y 'completed' en el mismo slot, solo bloquea
-- duplicados mientras estén vivas. Comprobamos primero que no haya duplicados.
DO $$
DECLARE v_dup int;
BEGIN
  SELECT COUNT(*) INTO v_dup FROM (
    SELECT doctor_id, scheduled_at, COUNT(*) AS n
    FROM appointments
    WHERE status::text IN ('scheduled','confirmed','pending','accepted')
    GROUP BY doctor_id, scheduled_at
    HAVING COUNT(*) > 1
  ) t;

  IF v_dup = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_uq
      ON appointments(doctor_id, scheduled_at)
      WHERE status::text IN ('scheduled','confirmed','pending','accepted');
    RAISE NOTICE '✅ appointments_doctor_slot_uq creada';
  ELSE
    RAISE NOTICE '⚠️  % duplicados en appointments(doctor_id,scheduled_at) activas — revisa antes de crear unique', v_dup;
  END IF;
END $$;

-- Verificación
SELECT 'V1_unique_indexes' AS section,
  indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN ('patients_doctor_email_uq','appointments_doctor_slot_uq');
