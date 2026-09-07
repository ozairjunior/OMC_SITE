import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  ADMIN_ROLES,
  getCurrentProfile,
  requireAuth,
  requireRole,
} from '@/lib/auth/access';

const user = { id: 'user-1', email: 'admin@example.test' } as User;

type ClientScenario = {
  currentUser?: User | null;
  authError?: { message: string } | null;
  profile?: Record<string, unknown> | null;
  profileError?: { code: string; message: string } | null;
  diagnostic?: { profile_exists: boolean } | null;
  diagnosticError?: { code: string; message: string } | null;
  mfaLevel?: 'aal1' | 'aal2';
};

function createSupabaseMock(scenario: ClientScenario = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: scenario.profile ?? null,
    error: scenario.profileError ?? null,
  });
  const profileQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  const rpcSingle = vi.fn().mockResolvedValue({
    data: scenario.diagnostic ?? { profile_exists: false },
    error: scenario.diagnosticError ?? null,
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: scenario.currentUser === undefined ? user : scenario.currentUser },
        error: scenario.authError ?? null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: scenario.mfaLevel ?? 'aal2' }, error: null,
        }),
      },
    },
    from: vi.fn().mockReturnValue(profileQuery),
    rpc: vi.fn().mockReturnValue({ single: rpcSingle }),
  } as unknown as SupabaseClient;
}

function profile(role: string, isActive = true) {
  return {
    id: user.id,
    full_name: 'Usuário de teste',
    role,
    is_active: isActive,
  };
}

describe('autenticação e autorização centralizadas', () => {
  it('aceita um usuário admin ativo', async () => {
    const result = await requireRole(
      createSupabaseMock({ profile: profile('admin') }),
      ADMIN_ROLES
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.role).toBe('admin');
  });

  it('aceita um usuário manager ativo', async () => {
    const result = await requireRole(
      createSupabaseMock({ profile: profile('manager') }),
      ADMIN_ROLES
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.role).toBe('manager');
  });

  it.each(['admin', 'manager'])('nega %s com sessao AAL1', async (role) => {
    const result = await requireRole(createSupabaseMock({ profile: profile(role), mfaLevel: 'aal1' }), ADMIN_ROLES);
    expect(result).toMatchObject({ ok: false, code: 'mfa_required' });
  });

  it.each(['admin', 'manager'])('permite %s com sessao AAL2', async (role) => {
    const result = await requireRole(createSupabaseMock({ profile: profile(role), mfaLevel: 'aal2' }), ADMIN_ROLES);
    expect(result.ok).toBe(true);
  });

  it('nega usuário autenticado sem profile', async () => {
    const result = await requireRole(
      createSupabaseMock({ profile: null, diagnostic: { profile_exists: false } }),
      ADMIN_ROLES
    );

    expect(result).toMatchObject({ ok: false, code: 'profile_missing' });
  });

  it('nega profile inativo', async () => {
    const result = await requireRole(
      createSupabaseMock({ profile: profile('admin', false) }),
      ADMIN_ROLES
    );

    expect(result).toMatchObject({ ok: false, code: 'profile_inactive' });
  });

  it.each(['viewer', 'attendant'])('nega role administrativa insuficiente: %s', async (role) => {
    const result = await requireRole(
      createSupabaseMock({ profile: profile(role) }),
      ADMIN_ROLES
    );

    expect(result).toMatchObject({ ok: false, code: 'role_forbidden' });
  });

  it('trata sessão expirada como usuário não autenticado', async () => {
    const result = await requireAuth(
      createSupabaseMock({
        currentUser: null,
        authError: { message: 'Auth session expired' },
      })
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'unauthenticated',
      message: 'Auth session expired',
    });
  });

  it('distingue profile ocultado por RLS de profile inexistente', async () => {
    const result = await getCurrentProfile(
      createSupabaseMock({ profile: null, diagnostic: { profile_exists: true } }),
      user.id
    );

    expect(result).toMatchObject({ ok: false, code: 'profile_query_failed' });
    if (!result.ok) expect(result.message).toContain('RLS');
  });

  it('reporta erro explícito quando a própria consulta é bloqueada por RLS', async () => {
    const result = await getCurrentProfile(
      createSupabaseMock({
        profileError: { code: '42501', message: 'row-level security policy violation' },
      }),
      user.id
    );

    expect(result).toMatchObject({ ok: false, code: 'profile_query_failed' });
    if (!result.ok) expect(result.message).toContain('RLS');
  });
});
