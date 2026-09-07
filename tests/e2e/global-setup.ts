import { createAuthTestData } from './auth-test-data';
import { isAuthE2EEnabled } from './auth-test-env';

export default async function globalSetup() {
  if (!isAuthE2EEnabled()) return;
  await createAuthTestData();
}
