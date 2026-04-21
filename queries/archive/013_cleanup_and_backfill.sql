-- @allow-write
-- Limpieza final + backfill para beta privada.
-- 1) Borra plan_features del plan 'enterprise' (legado — ya usamos 'clinic')
-- 2) Asegura que cada doctor tenga reminders_settings (previene null pointer UI)
-- 3) Muestra el estado de subscriptions (4 rows vs 4 doctores esperados)

-- 1. Limpieza de plan_features huérfanas
DELETE FROM plan_features WHERE plan = 'enterprise';

-- 2. Backfill reminders_settings para doctores que no tengan uno
INSERT INTO reminders_settings (doctor_id)
SELECT p.id FROM profiles p
WHERE p.role = 'doctor'::user_role
  AND NOT EXISTS (SELECT 1 FROM reminders_settings rs WHERE rs.doctor_id = p.id);

-- 3. Estado de doctores y sus suscripciones
SELECT
  'doctors_and_subs' AS section,
  p.id AS doctor_id,
  p.email,
  p.full_name,
  p.role::text AS role,
  p.reviewed_by_admin,
  s.plan::text AS plan,
  s.status::text AS status,
  s.current_period_end::date AS expires,
  (SELECT EXISTS(SELECT 1 FROM reminders_settings rs WHERE rs.doctor_id = p.id)) AS has_reminders_settings
FROM profiles p
LEFT JOIN subscriptions s ON s.doctor_id = p.id
WHERE p.role IN ('doctor','super_admin')
ORDER BY p.role DESC, p.email;

-- 4. Estado final de plan_features
SELECT 'plan_features_final' AS section,
  plan,
  COUNT(*) FILTER (WHERE enabled) AS enabled,
  COUNT(*) FILTER (WHERE NOT enabled) AS disabled
FROM plan_features GROUP BY plan ORDER BY plan;

-- 5. Summary final
SELECT 'summary' AS section,
  (SELECT COUNT(*) FROM auth.users)                                          AS auth_users,
  (SELECT COUNT(*) FROM profiles)                                            AS profiles,
  (SELECT COUNT(*) FROM profiles WHERE role = 'doctor'::user_role)           AS doctors,
  (SELECT COUNT(*) FROM profiles WHERE role = 'super_admin'::user_role)      AS super_admins,
  (SELECT COUNT(*) FROM subscriptions)                                       AS subscriptions,
  (SELECT COUNT(*) FROM reminders_settings)                                  AS reminders_settings,
  (SELECT COUNT(*) FROM plan_configs WHERE is_active)                        AS active_plans;
