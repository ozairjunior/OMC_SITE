-- Garante que cada usuário de auth.users tenha um profile usado pela autorização/RLS.
-- Novos usuários recebem o menor privilégio; a promoção de role deve ser explícita.
-- Para promover uma conta existente, execute no SQL Editor com um e-mail conhecido:
--
-- UPDATE public.profiles
-- SET role = 'admin'::public.user_role, updated_at = NOW()
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'usuario@exemplo.com');
--
-- Nunca execute UPDATE sem WHERE e nunca derive role de raw_user_meta_data.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Usuário'
    ),
    'viewer'::public.user_role,
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Corrige usuários já existentes sem alterar profiles ou roles existentes.
INSERT INTO public.profiles (id, full_name, role, is_active)
SELECT
  users.id,
  COALESCE(
    NULLIF(users.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(split_part(COALESCE(users.email, ''), '@', 1), ''),
    'Usuário'
  ),
  'viewer'::public.user_role,
  true
FROM auth.users AS users
LEFT JOIN public.profiles AS profiles ON profiles.id = users.id
WHERE profiles.id IS NULL;

-- O usuário autenticado precisa conseguir ler o próprio profile.
GRANT SELECT ON public.profiles TO authenticated;
DROP POLICY IF EXISTS "User Read Own Profile" ON public.profiles;
CREATE POLICY "User Read Own Profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Diagnóstico seguro para diferenciar profile inexistente de SELECT ocultado por RLS.
-- A função nunca aceita um id externo: consulta exclusivamente auth.uid().
CREATE OR REPLACE FUNCTION public.get_my_profile_access()
RETURNS TABLE (
  profile_exists boolean,
  profile_role public.user_role,
  profile_is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    profiles.id IS NOT NULL,
    profiles.role,
    profiles.is_active
  FROM (SELECT auth.uid() AS id) AS current_user_id
  LEFT JOIN public.profiles AS profiles ON profiles.id = current_user_id.id;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile_access() TO authenticated;
