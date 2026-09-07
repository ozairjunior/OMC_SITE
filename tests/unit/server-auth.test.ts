import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createClient: vi.fn(() => ({ client: true })),
  redirect: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/auth/access', () => ({
  ADMIN_ROLES: ['admin', 'manager'],
  requireRole: mocks.requireRole,
}));

import { requireAdminApi } from '@/lib/auth/server';

describe('autorização das APIs administrativas', () => {
  beforeEach(() => {
    mocks.requireRole.mockReset();
  });

  it('retorna 401 para API sem autenticação', async () => {
    mocks.requireRole.mockResolvedValue({
      ok: false,
      code: 'unauthenticated',
      message: 'Sem sessão',
    });

    const result = await requireAdminApi();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it.each(['profile_missing', 'profile_inactive', 'role_forbidden'])(
    'retorna 403 para %s',
    async (code) => {
      mocks.requireRole.mockResolvedValue({ ok: false, code, message: 'Acesso negado' });

      const result = await requireAdminApi();

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
    }
  );

  it('retorna 500 quando não é possível validar o profile', async () => {
    mocks.requireRole.mockResolvedValue({
      ok: false,
      code: 'profile_query_failed',
      message: 'Falha de banco',
    });

    const result = await requireAdminApi();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(500);
  });

  it('aceita admin e usa a mesma lista de roles do middleware', async () => {
    mocks.requireRole.mockResolvedValue({
      ok: true,
      user: { id: 'user-1' },
      profile: { id: 'user-1', full_name: 'Admin', role: 'admin', is_active: true },
    });

    const result = await requireAdminApi();

    expect(result.ok).toBe(true);
    expect(mocks.requireRole).toHaveBeenCalledWith({ client: true }, ['admin', 'manager']);
  });
});
