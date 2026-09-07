import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  TEST_PASSWORD,
  TEST_USERS,
  isAuthE2EEnabled,
  testSupabaseEnv,
} from './auth-test-env';
import { findTestUserId, serviceClient } from './auth-test-data';

test.skip(
  !isAuthE2EEnabled(),
  'Defina RUN_AUTH_E2E, ALLOW_TEST_DATA_MUTATION e SUPABASE_TEST_* para executar.'
);

async function login(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Entrar no Painel' }).click();
}

test.describe('fluxo administrativo completo', () => {
  test('login com usuário admin válido', async ({ page }) => {
    await login(page, TEST_USERS.admin.email);
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByRole('heading', { name: /Dashboard Comercial/ })).toBeVisible();
  });

  test('login com usuário manager válido', async ({ page }) => {
    await login(page, TEST_USERS.manager.email);
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByText(/manager/)).toBeVisible();
  });

  test('login com senha inválida', async ({ page }) => {
    await login(page, TEST_USERS.admin.email, `${TEST_PASSWORD}-incorreta`);
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText(/E-mail ou senha inválidos/)).toBeVisible();
  });

  test('login com usuário inexistente', async ({ page }) => {
    await login(page, 'omc-e2e-inexistente@example.com');
    await expect(page).toHaveURL(/\/admin\/login/);
    // Supabase não diferencia conta inexistente de senha errada para evitar enumeração.
    await expect(page.getByText(/E-mail ou senha inválidos/)).toBeVisible();
  });

  test('usuário autenticado sem profile recebe acesso negado', async ({ page }) => {
    await login(page, TEST_USERS.missingProfile.email);
    await expect(page).toHaveURL(/\/admin\/acesso-negado\?reason=profile_missing/);
  });

  test('profile inativo recebe acesso negado', async ({ page }) => {
    await login(page, TEST_USERS.inactive.email);
    await expect(page).toHaveURL(/\/admin\/acesso-negado\?reason=profile_inactive/);
  });

  test('viewer não recebe acesso administrativo', async ({ page }) => {
    await login(page, TEST_USERS.viewer.email);
    await expect(page).toHaveURL(/\/admin\/acesso-negado\?reason=role_forbidden/);
  });

  test('acesso direto ao dashboard sem login volta ao login', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('todas as APIs administrativas protegidas retornam 401 sem autenticação', async ({ request }) => {
    const protectedRequests = [
      { method: 'GET', path: '/api/admin/analytics' },
      { method: 'POST', path: '/api/admin/products' },
      { method: 'PATCH', path: '/api/admin/orders/00000000-0000-0000-0000-000000000000/status' },
      { method: 'POST', path: '/api/admin/products/00000000-0000-0000-0000-000000000000/images' },
      {
        method: 'DELETE',
        path: '/api/admin/products/00000000-0000-0000-0000-000000000000/images/00000000-0000-0000-0000-000000000000',
      },
    ];

    for (const protectedRequest of protectedRequests) {
      const response = await request.fetch(protectedRequest.path, {
        method: protectedRequest.method,
      });
      expect(response.status(), protectedRequest.path).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'unauthenticated' });
    }
  });

  test('middleware e API aplicam a mesma regra para viewer', async ({ page }) => {
    await login(page, TEST_USERS.viewer.email);
    await expect(page).toHaveURL(/reason=role_forbidden/);

    const response = await page.request.get('/api/admin/analytics');
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'role_forbidden' });
  });

  for (const [role, email] of [
    ['admin', TEST_USERS.admin.email],
    ['manager', TEST_USERS.manager.email],
  ] as const) {
    test(`middleware e API aceitam ${role}`, async ({ page }) => {
      await login(page, email);
      await expect(page).toHaveURL(/\/admin\/dashboard$/);

      const response = await page.request.get('/api/admin/analytics');
      expect(response.status()).toBe(200);
    });
  }

  test('sessão cujo usuário deixou de existir é rejeitada como expirada/inválida', async ({ page }) => {
    await login(page, TEST_USERS.expired.email);
    await expect(page).toHaveURL(/\/admin\/dashboard$/);

    const userId = await findTestUserId(TEST_USERS.expired.email);
    const { error } = await serviceClient().auth.admin.deleteUser(userId);
    expect(error).toBeNull();

    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('logout limpa a sessão e impede retorno ao painel', async ({ page }) => {
    await login(page, TEST_USERS.admin.email);
    await expect(page).toHaveURL(/\/admin\/dashboard$/);

    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    await page.goBack();
    await expect(page).not.toHaveURL(/\/admin\/dashboard$/);

    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});

test.describe('RLS real do Supabase', () => {
  async function authenticatedClient(email: string) {
    const env = testSupabaseEnv();
    const client = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
    expect(error).toBeNull();
    return client;
  }

  for (const [role, email] of [
    ['admin', TEST_USERS.admin.email],
    ['manager', TEST_USERS.manager.email],
  ] as const) {
    test(`${role} consegue executar operação protegida`, async () => {
      const client = await authenticatedClient(email);
      const slug = `omc-e2e-${role}-${Date.now()}`;

      const { data, error } = await client
        .from('categories')
        .insert({ name: `E2E ${role}`, slug, is_active: false })
        .select('id')
        .single();

      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      await serviceClient().from('categories').delete().eq('slug', slug);
    });
  }

  for (const [label, email] of [
    ['viewer', TEST_USERS.viewer.email],
    ['profile inativo', TEST_USERS.inactive.email],
    ['sem profile', TEST_USERS.missingProfile.email],
  ] as const) {
    test(`${label} é bloqueado pela RLS`, async () => {
      const client = await authenticatedClient(email);
      const slug = `omc-e2e-denied-${Date.now()}`;

      const { error } = await client
        .from('categories')
        .insert({ name: 'E2E negado', slug, is_active: false });

      expect(error).not.toBeNull();
    });
  }

  test('usuário anônimo é bloqueado pela RLS', async () => {
    const env = testSupabaseEnv();
    const client = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await client.from('categories').insert({
      name: 'E2E anônimo',
      slug: `omc-e2e-anon-${Date.now()}`,
      is_active: false,
    });

    expect(error).not.toBeNull();
  });
});
