SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='doctor_templates'
ORDER BY ordinal_position;

SELECT 'check_constraint' AS section, conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.doctor_templates'::regclass;

SELECT 'enum_types_for_template_type' AS section, t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
FROM pg_type t LEFT JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname ILIKE '%template%'
GROUP BY t.typname;

SELECT 'sample_rows' AS section, doctor_id, template_type, created_at
FROM doctor_templates
ORDER BY created_at DESC LIMIT 5;
