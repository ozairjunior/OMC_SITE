import { createHash, createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const EMAIL = 'omc-smoke-admin@example.test';

function localEnv() {
  if (process.env.OMC_LOCAL_TEST !== 'true' || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321') {
    throw new Error('AMBIENTE BLOQUEADO: o smoke admin exige Supabase local em http://127.0.0.1:54321.');
  }
  if (!process.env.E2E_TEST_PASSWORD) throw new Error('E2E_TEST_PASSWORD não configurada.');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY local não configurada.');
  return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, password: process.env.E2E_TEST_PASSWORD, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY };
}

export function smokeAdminEmail() { return EMAIL; }
export function smokeAdminPassword() { return localEnv().password; }

export function localServiceClient() {
  const env = localEnv();
  return createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function decodeBase32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function currentTotp(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter));
  const key = decodeBase32(secret);
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}

export async function createLocalSmokeAdmin() {
  const supabase = localServiceClient();
  const { data: users, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  for (const user of users.users.filter((candidate) => candidate.email === EMAIL)) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
  const env = localEnv();
  const { data, error } = await supabase.auth.admin.createUser({ email: EMAIL, password: env.password, email_confirm: true });
  if (error || !data.user) throw error || new Error('Falha ao criar o admin smoke local.');
  const { error: profileError } = await supabase.from('profiles').upsert({ id: data.user.id, full_name: 'OMC Smoke Admin', role: 'admin', is_active: true });
  if (profileError) throw profileError;

  const userClient = createClient(env.url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await userClient.auth.signInWithPassword({ email: EMAIL, password: env.password });
  if (signInError) throw signInError;
  const { data: enrollment, error: enrollError } = await userClient.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'OMC Smoke TOTP' });
  if (enrollError || !enrollment) throw enrollError || new Error('Falha ao cadastrar TOTP local.');
  const code = currentTotp(enrollment.totp.secret);
  const { data: challenge, error: challengeError } = await userClient.auth.mfa.challenge({ factorId: enrollment.id });
  if (challengeError || !challenge) throw challengeError || new Error('Falha ao desafiar TOTP local.');
  const { error: verifyError } = await userClient.auth.mfa.verify({ factorId: enrollment.id, challengeId: challenge.id, code });
  if (verifyError) throw verifyError;
  return { id: data.user.id, totpSecret: enrollment.totp.secret };
}

export async function removeLocalSmokeAdmin() {
  const supabase = localServiceClient();
  const { data: users, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  for (const user of users.users.filter((candidate) => candidate.email === EMAIL)) {
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
  }
}
