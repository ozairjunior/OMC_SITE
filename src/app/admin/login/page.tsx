'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES, requireRole } from '@/lib/auth/access';
import { publicAuthError } from '@/lib/auth/errors';
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const rateLimitResponse = await fetch('/api/auth/login-attempt', { method: 'POST' });
    if (!rateLimitResponse.ok) {
      const body = await rateLimitResponse.json().catch(() => ({}));
      setErrorMsg(body.error || publicAuthError()); setLoading(false); return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      void fetch('/api/auth/login-failure', { method: 'POST' });
      setErrorMsg(publicAuthError());
      setLoading(false);
      return;
    }
    if (!data.user) {
      setErrorMsg(publicAuthError());
      setLoading(false);
      return;
    }
    if (!data.session) {
      setErrorMsg(publicAuthError());
      setLoading(false);
      return;
    }

    // Uma nova instância precisa conseguir reler a sessão gravada nos cookies.
    const persistedClient = createClient();
    const {
      data: { session: persistedSession },
      error: sessionError,
    } = await persistedClient.auth.getSession();
    if (sessionError || !persistedSession) {
      setErrorMsg(publicAuthError());
      setLoading(false);
      return;
    }

    const access = await requireRole(persistedClient, ADMIN_ROLES);
    if (!access.ok) {
      if (access.code === 'unauthenticated') {
        setErrorMsg(publicAuthError());
        setLoading(false);
        return;
      }

      if (access.code === 'mfa_required') {
        router.replace('/admin/seguranca');
        return;
      }

      router.replace(`/admin/acesso-negado?reason=${access.code}`);
      router.refresh();
      return;
    }

    router.replace('/admin/dashboard');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-md border border-slate-200 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-amber-50 text-amber-600 rounded-full">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Painel Administrativo</h1>
          <p className="text-xs text-slate-500">Oliveira Material de Construção</p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@omc.com.br"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-lg text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar no Painel'}
          </button>
        </form>
      </div>
    </div>
  );
}
