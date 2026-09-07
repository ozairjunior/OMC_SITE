import { createClient } from '@supabase/supabase-js';

const expectedEmail = 'jjunior2100@gmail.com';
const expectedUserId = '7c589d00-68b7-4cd4-b73e-03ef6dd5b4a9';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const newPassword = process.env.OMC_NEW_ADMIN_PASSWORD;

if (!supabaseUrl || !serviceRoleKey || !newPassword) {
  throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e OMC_NEW_ADMIN_PASSWORD.');
}

if (newPassword.length < 8) {
  throw new Error('A nova senha deve ter pelo menos 8 caracteres.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
let page = 1;
let matchedUser = null;

while (!matchedUser) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error(`Falha ao localizar o usuário: ${error.message}`);

  matchedUser = data.users.find((user) => user.email?.toLowerCase() === expectedEmail);
  if (data.users.length < 1000) break;
  page += 1;
}

if (!matchedUser) {
  throw new Error('Usuário esperado não encontrado pelo e-mail informado.');
}

if (matchedUser.id !== expectedUserId) {
  throw new Error('O UUID do usuário encontrado não corresponde ao UUID esperado.');
}

if (matchedUser.email?.toLowerCase() !== expectedEmail) {
  throw new Error('O e-mail do usuário encontrado não corresponde ao e-mail esperado.');
}

const { error } = await supabase.auth.admin.updateUserById(expectedUserId, {
  password: newPassword,
});

if (error) {
  throw new Error(`Falha ao redefinir a senha: ${error.message}`);
}

console.log('Senha do administrador redefinida com sucesso.');
