import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

loadEnvFile(resolve(process.cwd(), '.env.test.local'));

if (process.env.OMC_LOCAL_TEST !== 'true') {
  throw new Error('AMBIENTE BLOQUEADO: smoke tests exigem OMC_LOCAL_TEST=true.');
}

const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
if (
  url.protocol !== 'http:' ||
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  url.port !== '54321' ||
  url.pathname !== '/'
) {
  throw new Error('AMBIENTE BLOQUEADO: smoke tests exigem Supabase local em http://127.0.0.1:54321.');
}

console.log('Resetting Supabase local database for the complete smoke suite...');
const supabaseBin = resolve(process.cwd(), 'node_modules', 'supabase', 'dist', 'supabase.js');
execFileSync(process.execPath, [supabaseBin, 'db', 'reset', '--local'], {
  stdio: 'inherit',
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: 'true' },
});

const playwrightBin = resolve(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
const args = [playwrightBin, 'test', 'tests/e2e/smoke-production-like.spec.ts'];
if (process.argv.includes('--headed')) args.push('--headed');
const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3100' } });
child.on('error', (error) => { console.error(error); process.exit(1); });
child.on('exit', (code) => process.exit(code ?? 1));
