export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'OMC-e2e-only-2026!';

export const TEST_USERS = {
  admin: { email: 'omc-e2e-admin@example.com', role: 'admin', active: true },
  manager: { email: 'omc-e2e-manager@example.com', role: 'manager', active: true },
  viewer: { email: 'omc-e2e-viewer@example.com', role: 'viewer', active: true },
  inactive: { email: 'omc-e2e-inactive@example.com', role: 'admin', active: false },
  missingProfile: { email: 'omc-e2e-no-profile@example.com', role: null, active: true },
  expired: { email: 'omc-e2e-expired@example.com', role: 'admin', active: true },
} as const;

export function isAuthE2EEnabled() {
  return (
    process.env.RUN_AUTH_E2E === 'true' &&
    process.env.ALLOW_TEST_DATA_MUTATION === 'true' &&
    Boolean(process.env.SUPABASE_TEST_URL) &&
    Boolean(process.env.SUPABASE_TEST_ANON_KEY) &&
    Boolean(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY) &&
    Boolean(process.env.SUPABASE_TEST_PROJECT_REF)
  );
}

export function testSupabaseEnv() {
  const url = process.env.SUPABASE_TEST_URL || '';
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY || '';
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || '';
  const expectedRef = process.env.SUPABASE_TEST_PROJECT_REF || '';

  if (!isAuthE2EEnabled()) {
    return { url, anonKey, serviceRoleKey, projectRef: expectedRef };
  }

  const parsedUrl = new URL(url);
  const actualRef = parsedUrl.hostname.split('.')[0];
  if (parsedUrl.pathname !== '/' || !parsedUrl.hostname.endsWith('.supabase.co')) {
    throw new Error('SUPABASE_TEST_URL deve ser a URL-base https://<project-ref>.supabase.co.');
  }
  if (actualRef !== expectedRef) {
    throw new Error('SUPABASE_TEST_PROJECT_REF não corresponde ao host de SUPABASE_TEST_URL.');
  }

  return { url, anonKey, serviceRoleKey, projectRef: actualRef };
}
