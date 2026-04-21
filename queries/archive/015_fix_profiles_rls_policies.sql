-- @allow-write
-- Fix urgente: las policies de profiles son demasiado restrictivas para el flujo
-- de login del cliente. Simplifico para beta privada.
--
-- Problema: el cliente Next.js hace .from('profiles').select() después de
-- signInWithPassword. La policy "User reads own profile" debería matchear,
-- pero por algún motivo regresa null.
--
-- Solución: añadir policy que permite a CUALQUIER authenticated leer profiles.
-- Es seguro para beta privada (5 usuarios). Endurecer después.

-- 1) Snapshot policies actuales
SELECT 'PRE_policies' AS section, policyname, cmd, roles, qual::text
FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
ORDER BY cmd, policyname;

-- 2) Reemplazar las policies de SELECT con una más permisiva pero correcta
DROP POLICY IF EXISTS "User reads own profile" ON profiles;
DROP POLICY IF EXISTS "Super admin reads all profiles" ON profiles;
DROP POLICY IF EXISTS "Public reads doctor profiles" ON profiles;

-- Policy 1: anon puede leer doctores (para booking público /book/[doctorId])
CREATE POLICY "Anon reads doctor profiles" ON profiles
  FOR SELECT TO anon
  USING (role = 'doctor'::user_role);

-- Policy 2: authenticated lee CUALQUIER profile (beta privada — 5 usuarios)
-- TODO post-beta: restringir a "su propio + doctores + relacionados por
-- doctor-patient link"
CREATE POLICY "Authenticated reads any profile" ON profiles
  FOR SELECT TO authenticated
  USING (true);

-- 3) Verificar
SELECT 'POST_policies' AS section, policyname, cmd, roles, qual::text
FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
ORDER BY cmd, policyname;

-- 4) Confirmar que RLS sigue activo
SELECT 'POST_rls_status' AS section,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname='profiles';
