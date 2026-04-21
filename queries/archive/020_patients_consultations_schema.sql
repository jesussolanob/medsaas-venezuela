-- Verificar columnas de patients y consultations (para validar las páginas nuevas)
SELECT 'patients_cols' AS section, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='patients'
ORDER BY ordinal_position;

SELECT 'consultations_cols' AS section, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='consultations'
ORDER BY ordinal_position;

-- prescriptions: ver si tiene 'notes' y si tiene algo para texto libre
SELECT 'prescriptions_cols' AS section, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='prescriptions'
ORDER BY ordinal_position;

-- Estados financieros actuales en consultations
SELECT 'payment_statuses' AS section,
  payment_status::text AS status, COUNT(*) AS n
FROM consultations
GROUP BY payment_status;
