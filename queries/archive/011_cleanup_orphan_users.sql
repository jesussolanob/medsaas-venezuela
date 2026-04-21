-- @allow-write
-- Borra 5 auth.users huérfanos (sin profile, sin data, sin subscription)

-- Verificación previa: deben tener 0 data en todas las tablas principales
SELECT
  'PRE_verification' AS section,
  u.email,
  u.id,
  (SELECT COUNT(*) FROM patients WHERE auth_user_id = u.id) AS patients,
  (SELECT COUNT(*) FROM appointments WHERE auth_user_id = u.id OR doctor_id = u.id) AS appointments,
  (SELECT COUNT(*) FROM consultations WHERE doctor_id = u.id) AS consultations,
  (SELECT COUNT(*) FROM patient_packages WHERE auth_user_id = u.id) AS packages,
  (SELECT COUNT(*) FROM subscriptions WHERE doctor_id = u.id) AS subscriptions
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Borrado
DELETE FROM auth.users
WHERE email IN (
  'juanito@gmail.com',
  'patricio@gmail.com',
  'paola@gmail.com',
  'pedrom@gmail.com',
  'anasolanob07@hotmail.com'
);

-- Verificación post
SELECT 'POST_still_orphans' AS section, COUNT(*) AS remaining
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;

SELECT 'POST_final_counts' AS section,
  (SELECT COUNT(*) FROM auth.users) AS auth_users,
  (SELECT COUNT(*) FROM profiles) AS profiles,
  (SELECT COUNT(*) FROM subscriptions) AS subscriptions;
