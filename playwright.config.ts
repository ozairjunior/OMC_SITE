import { defineConfig, devices } from '@playwright/test';
import { isAuthE2EEnabled, testSupabaseEnv } from './tests/e2e/auth-test-env';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const enabled = isAuthE2EEnabled();
const checkoutEnabled = process.env.RUN_CHECKOUT_E2E === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer:
    (enabled || checkoutEnabled) && !process.env.PLAYWRIGHT_BASE_URL
      ? {
          command: 'npm run dev',
          url: `${baseURL}/admin/login`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          ...(enabled
            ? {
                env: {
                  NEXT_PUBLIC_SUPABASE_URL: testSupabaseEnv().url,
                  NEXT_PUBLIC_SUPABASE_ANON_KEY: testSupabaseEnv().anonKey,
                  SUPABASE_SERVICE_ROLE_KEY: testSupabaseEnv().serviceRoleKey,
                },
              }
            : {}),
        }
      : undefined,
});
