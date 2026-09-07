export type SupabaseAuthError = {
  code?: string;
  message: string;
  status?: number;
};

export function describeAuthError(error: SupabaseAuthError) {
  if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message)) {
    return 'O e-mail existe, mas ainda não foi confirmado no Supabase Auth.';
  }
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)) {
    return 'E-mail ou senha inválidos. Por segurança, o Supabase Auth não informa se o usuário não existe ou se somente a senha está incorreta.';
  }
  if (error.code === 'user_not_found') return 'O usuário não existe no Supabase Auth.';
  return `Erro do Supabase Auth (${error.code || error.status || 'sem código'}): ${error.message}`;
}

export function publicAuthError() {
  return 'Não foi possível acessar o painel. Verifique suas credenciais e tente novamente.';
}
