import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const execute = process.argv.includes('--execute');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente local.');
}

const storage = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
}).storage.from('product-images');

const files = [];

async function walk(prefix) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage.list(prefix, { limit: 1000, offset });
    if (error) throw error;
    const page = data ?? [];
    for (const item of page) {
      const path = `${prefix}/${item.name}`;
      if (item.id) files.push(path);
      else await walk(path);
    }
    if (page.length < 1000) break;
  }
}

await walk('products');

console.log(`${execute ? 'Removendo' : 'Dry-run:'} ${files.length} arquivo(s) encontrados em product-images/products.`);
for (let i = 0; i < files.length; i += 100) {
  const batch = files.slice(i, i + 100);
  console.log(batch.join('\n'));
  if (execute) {
    const { error } = await storage.remove(batch);
    if (error) throw error;
  }
}

if (!execute) {
  console.log('Nenhum arquivo foi removido. Use --execute para confirmar a exclusao.');
}
