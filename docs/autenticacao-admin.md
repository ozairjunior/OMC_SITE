# Autenticação administrativa

O painel separa autenticação de autorização:

- `getCurrentUser()` valida a identidade junto ao Supabase Auth com `getUser()`.
- `getCurrentProfile()` carrega o registro correspondente em `public.profiles`.
- `requireAuth()` exige somente uma identidade válida.
- `requireRole()` exige profile existente, ativo e uma role permitida.
- O painel e suas APIs aceitam somente `admin` e `manager`.

Novos usuários recebem `viewer` pela migration
`20260815_create_auth_profiles.sql`. Isso evita conceder acesso administrativo
automaticamente.

## Promover um usuário

Execute no SQL Editor do Supabase, substituindo o e-mail:

```sql
UPDATE public.profiles
SET role = 'admin'::public.user_role,
    updated_at = NOW()
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'usuario@exemplo.com'
);
```

Use `manager` no lugar de `admin` quando esse for o nível necessário. Confira o
resultado antes de encerrar o SQL Editor:

```sql
SELECT users.email, profiles.role, profiles.is_active
FROM auth.users AS users
JOIN public.profiles AS profiles ON profiles.id = users.id
WHERE users.email = 'usuario@exemplo.com';
```

Não use metadados enviados pelo cliente para definir roles e não execute a
promoção sem filtrar um usuário específico.
