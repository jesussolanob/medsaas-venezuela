-- @allow-write
-- PASO 6b — UNIQUE sin TRIM (que no es IMMUTABLE en combinación)

-- Variante IMMUTABLE: usamos LOWER(email) directo
CREATE UNIQUE INDEX IF NOT EXISTS patients_doctor_email_uq
  ON patients(doctor_id, LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

-- Unicidad de slot activo por doctor
DO $$
DECLARE v_dup int;
BEGIN
  SELECT COUNT(*) INTO v_dup FROM (
    SELECT doctor_id, scheduled_at
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
    RAISE NOTICE '⚠️ % duplicados — revisar antes de crear unique', v_dup;
  END IF;
END $$;

SELECT 'V1_unique_indexes_created' AS section,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN ('patients_doctor_email_uq','appointments_doctor_slot_uq');
