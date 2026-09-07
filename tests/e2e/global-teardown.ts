import { removeAuthTestData } from './auth-test-data';
import { isAuthE2EEnabled } from './auth-test-env';

export default async function globalTeardown() {
  if (!isAuthE2EEnabled()) return;
  await removeAuthTestData();
}
