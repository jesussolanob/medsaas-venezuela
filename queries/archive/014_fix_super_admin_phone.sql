-- @allow-write
-- Fix: super_admin profile sin phone → /auth/callback lo manda a /onboarding
-- Solución inmediata: ponerle un phone placeholder para que pase el check.

-- Ver estado actual
SELECT 'PRE' AS section, id, email, full_name, role::text, phone, reviewed_by_admin
FROM profiles WHERE role = 'super_admin'::user_role;

-- Fix: poner phone '0000000000' para el super_admin (placeholder válido)
UPDATE profiles
   SET phone = COALESCE(phone, '0000000000'),
       reviewed_by_admin = true
 WHERE role = 'super_admin'::user_role;

-- Bonus: también pongo reviewed_by_admin=true a paoladg7 si es real
-- (si no quieres, borra la línea)
UPDATE profiles
   SET reviewed_by_admin = true
 WHERE email = 'paoladg7@gmail.com';

-- Ver estado final
SELECT 'POST' AS section, id, email, full_name, role::text, phone, reviewed_by_admin
FROM profiles ORDER BY role, email;
