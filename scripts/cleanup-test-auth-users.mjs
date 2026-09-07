import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const keepEmail = 'jjunior2100@gmail.com';
const execute = process.argv.includes('--execute');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const users = [];
for (let page = 1;; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
const removable = users.filter((user) => user.email?.toLowerCase() !== keepEmail);
console.log(`${execute ? 'Removendo' : 'Dry-run:'} ${removable.length} usuário(s).`);
for (const user of removable) {
  console.log(`${user.id} ${user.email ?? '(sem e-mail)'}`);
  if (execute) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
}
if (!execute) console.log('Nenhuma alteração foi feita. Use --execute para confirmar.');
