import type { SupabaseClient, User } from '@supabase/supabase-js';

export const USER_ROLES = ['admin', 'manager', 'attendant', 'viewer'] as const;
export const ADMIN_ROLES = ['admin', 'manager'] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
};

export type AuthFailureCode =
  | 'unauthenticated'
  | 'profile_missing'
  | 'profile_inactive'
  | 'role_forbidden'
  | 'profile_query_failed'
  | 'mfa_required';

export type AuthFailure = {
  ok: false;
  code: AuthFailureCode;
  message: string;
};

export type AuthenticatedUser = { ok: true; user: User };
export type AuthorizedUser = { ok: true; user: User; profile: Profile };

export async function getCurrentUser(
  supabase: SupabaseClient
): Promise<AuthenticatedUser | AuthFailure> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      code: 'unauthenticated',
      message: error?.message || 'Nenhum usuário autenticado foi encontrado.',
    };
  }

  return { ok: true, user };
}

export async function getCurrentProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true; profile: Profile } | AuthFailure> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    const isRlsError =
      error.code === '42501' || error.message.toLowerCase().includes('row-level security');
    return {
      ok: false,
      code: 'profile_query_failed',
      message: isRlsError
        ? `RLS bloqueou a leitura do profile (${error.code}).`
        : `Falha ao consultar o profile (${error.code || 'sem código'}: ${error.message}).`,
    };
  }

  if (!data) {
    // SELECT bloqueado por RLS também pode retornar zero linhas. A RPC consulta
    // exclusivamente auth.uid() e distingue esse caso de um profile inexistente.
    const { data: diagnosticData, error: diagnosticError } = await supabase
      .rpc('get_my_profile_access')
      .single();
    const diagnostic = diagnosticData as { profile_exists: boolean } | null;

    if (diagnosticError) {
      return {
        ok: false,
        code: 'profile_query_failed',
        message: `Não foi possível validar o profile. Confirme a migration 20260815_create_auth_profiles (${diagnosticError.code}: ${diagnosticError.message}).`,
      };
    }

    if (diagnostic?.profile_exists) {
      return {
        ok: false,
        code: 'profile_query_failed',
        message: 'O profile existe, mas a política RLS ocultou a linha do próprio usuário.',
      };
    }

    return {
      ok: false,
      code: 'profile_missing',
      message: 'O usuário autenticado não possui registro em public.profiles.',
    };
  }

  return { ok: true, profile: data as Profile };
}

export async function requireAuth(
  supabase: SupabaseClient
): Promise<AuthenticatedUser | AuthFailure> {
  return getCurrentUser(supabase);
}

export async function requireRole(
  supabase: SupabaseClient,
  allowedRoles: readonly UserRole[]
): Promise<AuthorizedUser | AuthFailure> {
  const authentication = await requireAuth(supabase);
  if (!authentication.ok) return authentication;

  const profileResult = await getCurrentProfile(supabase, authentication.user.id);
  if (!profileResult.ok) return profileResult;

  if (!profileResult.profile.is_active) {
    return {
      ok: false,
      code: 'profile_inactive',
      message: 'O profile está inativo.',
    };
  }

  if (!allowedRoles.includes(profileResult.profile.role)) {
    return {
      ok: false,
      code: 'role_forbidden',
      message: `A role ${profileResult.profile.role} não possui permissão para esta área.`,
    };
  }

  if (profileResult.profile.role === 'admin' || profileResult.profile.role === 'manager') {
    const mfa = supabase.auth.mfa
      ? await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      : { data: { currentLevel: 'aal2' as const }, error: null };
    if (mfa.error || mfa.data.currentLevel !== 'aal2') {
      return { ok: false, code: 'mfa_required', message: 'A autenticação multifator é necessária.' };
    }
  }

  return {
    ok: true,
    user: authentication.user,
    profile: profileResult.profile,
  };
}
