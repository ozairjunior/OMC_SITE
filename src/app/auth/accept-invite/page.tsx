'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AcceptInvitePage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError || !data.session) setError('Este convite é inválido ou expirou. Solicite um novo convite.');
      else setReady(true);
    });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.');
    if (password !== confirm) return setError('As senhas não conferem.');
    setSaving(true); setError('');
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) { setError('Não foi possível definir a senha. Solicite um novo convite.'); setSaving(false); return; }
    router.replace('/admin/login?invited=1');
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow"><h1 className="text-xl font-bold">Ativar acesso</h1><p className="text-sm text-slate-600">Defina uma senha para acessar o painel administrativo.</p>{error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}{ready && <><input required type="password" minLength={8} placeholder="Nova senha" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded border p-2" /><input required type="password" minLength={8} placeholder="Confirme a senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded border p-2" /><button disabled={saving} className="w-full rounded bg-amber-600 p-2 font-semibold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Definir senha'}</button></>}</form></main>;
}
