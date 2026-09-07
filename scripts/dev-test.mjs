import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const envFile = resolve(root, '.env.test.local');

loadEnvFile(envFile);

if (process.env.OMC_LOCAL_TEST !== 'true') {
  throw new Error(
    'AMBIENTE BLOQUEADO: OMC_LOCAL_TEST deve ser true para iniciar dev:test.'
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!supabaseUrl) {
  throw new Error(
    'AMBIENTE BLOQUEADO: NEXT_PUBLIC_SUPABASE_URL não foi configurada.'
  );
}

const parsed = new URL(supabaseUrl);

const isAllowedLocalSupabase =
  parsed.protocol === 'http:' &&
  (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
  parsed.port === '54321';

if (!isAllowedLocalSupabase) {
  throw new Error(
    `AMBIENTE BLOQUEADO: dev:test só pode utilizar o Supabase local na porta 54321. URL recebida: ${supabaseUrl}`
  );
}

if (parsed.hostname.endsWith('.supabase.co')) {
  throw new Error(
    'AMBIENTE BLOQUEADO: dev:test nunca pode utilizar Supabase remoto.'
  );
}

console.log('');
console.log('==============================================');
console.log(' OMC - AMBIENTE LOCAL DE TESTES');
console.log(' Aplicação : http://127.0.0.1:3100');
console.log(' Supabase  : http://127.0.0.1:54321');
console.log('==============================================');
console.log('');

const nextBin = resolve(root, 'node_modules', 'next', 'dist', 'bin', 'next');

const child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', '3100'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '3100',
  },
});

child.on('error', (error) => {
  console.error('Falha ao iniciar o Next.js de testes:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
