'use client';

import { useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';

export function AdminLogoutButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogout = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/logout', {
        method: 'POST',
        cache: 'no-store',
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Não foi possível encerrar a sessão.');
      }

      // Recarregamento completo evita reutilizar estado React ou páginas do cache.
      window.location.replace('/admin/login');
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Falha ao sair.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        Sair
      </button>
      {error && <span className="max-w-xs text-right text-xs text-red-600">{error}</span>}
    </div>
  );
}
