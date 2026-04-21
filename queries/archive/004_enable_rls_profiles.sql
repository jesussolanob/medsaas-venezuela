-- @allow-write
-- PASO 4 — Habilitar RLS en profiles con policies apropiadas.
--
-- Diseño:
--   • anon + authenticated pueden LEER perfiles de doctores (role='doctor')
--       → necesario para /book/[doctorId] público y listados
--   • authenticated user lee SU PROPIO row
--   • super_admin lee/modifica todo
--   • user actualiza solo SU PROPIO row
--   • INSERT: solo vía service_role (admin client desde backend). Esto es estándar
--     en Supabase — el trigger handle_new_user() usa SECURITY DEFINER bypass.
--   • DELETE: solo super_admin (delete normalmente cascadea desde auth.users).

-- ─────────────────────────────────────────────────────────────────────────
-- 4.1 Crear policies ANTES de activar RLS (importante: sin policies + RLS
-- on = nadie puede leer la tabla).
-- ─────────────────────────────────────────────────────────────────────────

-- SELECT: anon/authenticated ven doctores (para booking)
DROP POLICY IF EXISTS "Public reads doctor profiles" ON profiles;
CREATE POLICY "Public reads doctor profiles" ON profiles
  FOR SELECT
  USING (role = 'doctor'::user_role);

-- SELECT: authenticated user ve su propio perfil
DROP POLICY IF EXISTS "User reads own profile" ON profiles;
CREATE POLICY "User reads own profile" ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- SELECT: super_admin ve todos los perfiles
DROP POLICY IF EXISTS "Super admin reads all profiles" ON profiles;
CREATE POLICY "Super admin reads all profiles" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid() AND p2.role = 'super_admin'::user_role
    )
  );

-- UPDATE: user actualiza su propio perfil
DROP POLICY IF EXISTS "User updates own profile" ON profiles;
CREATE POLICY "User updates own profile" ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- UPDATE: super_admin actualiza cualquier perfil
DROP POLICY IF EXISTS "Super admin updates profiles" ON profiles;
CREATE POLICY "Super admin updates profiles" ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid() AND p2.role = 'super_admin'::user_role
    )
  );

-- INSERT: permitir solo al usuario autenticado crear su propio perfil
-- (el service_role bypassa RLS siempre)
DROP POLICY IF EXISTS "User inserts own profile" ON profiles;
CREATE POLICY "User inserts own profile" ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- DELETE: solo super_admin (aunque normalmente elimina por cascade desde auth.users)
DROP POLICY IF EXISTS "Super admin deletes profiles" ON profiles;
CREATE POLICY "Super admin deletes profiles" ON profiles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid() AND p2.role = 'super_admin'::user_role
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4.2 Activar RLS en profiles
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────
-- Verificaciones
-- ─────────────────────────────────────────────────────────────────────────
SELECT 'V1_rls_enabled' AS section,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relname='profiles';

SELECT 'V2_profiles_policies' AS section,
  policyname, cmd, roles, permissive
FROM pg_policies
WHERE schemaname='public' AND tablename='profiles'
ORDER BY cmd, policyname;

-- Tablas que aún no tienen RLS (debería quedar vacío o sólo tablas internas aceptables)
SELECT 'V3_tables_still_no_rls' AS section,
  t.tablename
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname='public' AND NOT c.relrowsecurity
ORDER BY t.tablename;
