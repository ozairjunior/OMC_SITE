import { createClient } from '@supabase/supabase-js';
import { TEST_PASSWORD, TEST_USERS, testSupabaseEnv } from './auth-test-env';

export function serviceClient() {
  const env = testSupabaseEnv();
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findTestUsers() {
  const supabase = serviceClient();
  const emails = new Set<string>(Object.values(TEST_USERS).map((testUser) => testUser.email));
  const matches = [];

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    matches.push(...data.users.filter((user) => user.email && emails.has(user.email)));
    if (data.users.length < 100) break;
  }

  return matches;
}

export async function removeAuthTestData() {
  const supabase = serviceClient();
  const users = await findTestUsers();
  for (const user of users) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }

  await supabase.from('categories').delete().like('slug', 'omc-e2e-%');
}

export async function createAuthTestData() {
  await removeAuthTestData();
  const supabase = serviceClient();

  for (const testUser of Object.values(TEST_USERS)) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: testUser.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `E2E ${testUser.email}` },
    });
    if (error || !data.user) throw error || new Error(`Falha ao criar ${testUser.email}`);

    if (testUser.role === null) {
      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', data.user.id);
      if (deleteProfileError) throw deleteProfileError;
      continue;
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      full_name: `E2E ${testUser.role}`,
      role: testUser.role,
      is_active: testUser.active,
    });
    if (profileError) throw profileError;
  }
}

export async function findTestUserId(email: string) {
  const user = (await findTestUsers()).find((candidate) => candidate.email === email);
  if (!user) throw new Error(`Usuário E2E não encontrado: ${email}`);
  return user.id;
}
