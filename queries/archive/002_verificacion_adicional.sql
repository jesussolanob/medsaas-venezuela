-- Verificación adicional antes de habilitar RLS en profiles
-- READ ONLY

-- A. Policies actuales en profiles (para saber si ya hay alguna, aunque RLS esté off)
SELECT
  'A_profiles_policies' AS section,
  policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='profiles'
ORDER BY policyname;

-- B. Policies en patient_messages
SELECT 'B_patient_messages_policies' AS section,
  policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='patient_messages';

-- C. Policies en admin_roles e invoices
SELECT 'C_admin_roles_policies' AS section,
  policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='admin_roles';

SELECT 'D_invoices_policies' AS section,
  policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='invoices';

-- E. Conteo de perfiles por rol
SELECT 'E_profiles_by_role' AS section,
  role::text AS role, COUNT(*) AS n
FROM profiles
GROUP BY role
ORDER BY role;

-- F. ¿Cuántos usuarios con rol 'assistant' hay?
SELECT 'F_assistants' AS section,
  id, email, full_name
FROM profiles WHERE role::text = 'assistant';

-- G. Ivana: ¿tiene profile? ¿tiene data asociada?
SELECT 'G_ivana_profile_check' AS section,
  'auth.users' AS source,
  u.id::text, u.email, u.created_at::text,
  (p.id IS NOT NULL)::text AS has_profile,
  (SELECT COUNT(*) FROM patients WHERE auth_user_id = u.id)::text AS n_patients,
  (SELECT COUNT(*) FROM appointments WHERE auth_user_id = u.id)::text AS n_appointments,
  (SELECT COUNT(*) FROM patient_packages WHERE auth_user_id = u.id)::text AS n_packages
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email = 'ivana@gmail.com';

-- H. Conteo total de registros en tablas críticas (para saber el volumen)
SELECT 'H_row_counts' AS section, 'profiles' AS tbl, COUNT(*)::text AS n FROM profiles
UNION ALL
SELECT 'H_row_counts','appointments',COUNT(*)::text FROM appointments
UNION ALL
SELECT 'H_row_counts','patients',COUNT(*)::text FROM patients
UNION ALL
SELECT 'H_row_counts','consultations',COUNT(*)::text FROM consultations
UNION ALL
SELECT 'H_row_counts','patient_packages',COUNT(*)::text FROM patient_packages
UNION ALL
SELECT 'H_row_counts','patient_messages',COUNT(*)::text FROM patient_messages
UNION ALL
SELECT 'H_row_counts','subscriptions',COUNT(*)::text FROM subscriptions
UNION ALL
SELECT 'H_row_counts','ehr_records',COUNT(*)::text FROM ehr_records
UNION ALL
SELECT 'H_row_counts','prescriptions',COUNT(*)::text FROM prescriptions
UNION ALL
SELECT 'H_row_counts','leads',COUNT(*)::text FROM leads;

-- I. ¿Qué relación existe entre consultation_id en appointments y appointment_id en consultations?
--    (Para detectar inconsistencia bidireccional)
SELECT 'I_bidirectional_fk' AS section,
  COUNT(*) FILTER (WHERE a.consultation_id IS NOT NULL) AS appt_with_consultation_id,
  COUNT(*) FILTER (WHERE a.consultation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM consultations c WHERE c.id = a.consultation_id)) AS appt_consultation_id_orphan,
  (SELECT COUNT(*) FROM consultations WHERE appointment_id IS NOT NULL) AS consultations_with_appointment_id,
  (SELECT COUNT(*) FROM consultations c WHERE c.appointment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.id = c.appointment_id)) AS consultations_orphan
FROM appointments a;

-- J. Policies de appointments (ver cuántas hay y qué hacen)
SELECT 'J_appointments_policies' AS section,
  policyname, cmd,
  SUBSTRING(qual FROM 1 FOR 80) AS qual_preview
FROM pg_policies
WHERE schemaname='public' AND tablename='appointments'
ORDER BY cmd, policyname;

-- K. Verificar si existe la RPC book_with_package que propuse
SELECT 'K_rpc_book_with_package' AS section,
  proname, pronargs,
  pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'book_with_package';
