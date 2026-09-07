import { describe, expect, it } from 'vitest';
import { describeAuthError } from '@/lib/auth/errors';

describe('mensagens do login', () => {
  it('identifica senha inválida sem afirmar que o usuário existe', () => {
    expect(
      describeAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' })
    ).toContain('E-mail ou senha inválidos');
  });

  it('identifica usuário inexistente quando o Supabase retorna user_not_found', () => {
    expect(describeAuthError({ code: 'user_not_found', message: 'User not found' })).toBe(
      'O usuário não existe no Supabase Auth.'
    );
  });

  it('identifica e-mail ainda não confirmado', () => {
    expect(
      describeAuthError({ code: 'email_not_confirmed', message: 'Email not confirmed' })
    ).toContain('ainda não foi confirmado');
  });

  it('preserva código e mensagem de erros inesperados do Supabase', () => {
    expect(describeAuthError({ code: 'unexpected_failure', message: 'Auth unavailable' })).toBe(
      'Erro do Supabase Auth (unexpected_failure): Auth unavailable'
    );
  });
});
