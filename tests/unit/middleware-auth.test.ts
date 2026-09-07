import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createServerClient: vi.fn(() => ({})),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock('@/lib/auth/access', () => ({
  ADMIN_ROLES: ['admin', 'manager'],
  requireRole: mocks.requireRole,
}));

import { proxy } from '../../src/proxy';

const authorized = {
  ok: true,
  user: { id: 'user-1' },
  profile: { id: 'user-1', full_name: 'Admin', role: 'admin', is_active: true },
};

describe('middleware administrativo', () => {
  beforeEach(() => {
    mocks.requireRole.mockReset();
  });

  it('redireciona acesso direto ao dashboard sem login', async () => {
    mocks.requireRole.mockResolvedValue({
      ok: false,
      code: 'unauthenticated',
      message: 'Sem sessão',
    });

    const response = await proxy(new NextRequest('http://localhost/admin/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/admin/login');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('redireciona admin autenticado da tela de login para o dashboard', async () => {
    mocks.requireRole.mockResolvedValue(authorized);

    const response = await proxy(new NextRequest('http://localhost/admin/login'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/admin/dashboard');
  });

  it('envia role sem permissão para acesso negado sem criar loop', async () => {
    mocks.requireRole.mockResolvedValue({
      ok: false,
      code: 'role_forbidden',
      message: 'Role não permitida',
    });

    const denied = await proxy(new NextRequest('http://localhost/admin/dashboard'));
    const deniedPage = await proxy(
      new NextRequest('http://localhost/admin/acesso-negado?reason=role_forbidden')
    );

    expect(denied.status).toBe(307);
    expect(denied.headers.get('location')).toContain('/admin/acesso-negado?reason=role_forbidden');
    expect(deniedPage.status).toBe(200);
  });

  it('usa exatamente as mesmas roles administrativas dos helpers', async () => {
    mocks.requireRole.mockResolvedValue(authorized);

    await proxy(new NextRequest('http://localhost/admin/dashboard'));

    expect(mocks.requireRole).toHaveBeenCalledWith(expect.anything(), ['admin', 'manager']);
  });
});
