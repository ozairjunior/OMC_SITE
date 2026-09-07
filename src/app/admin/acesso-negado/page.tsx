import Link from 'next/link';
import { ShieldX } from 'lucide-react';

const REASON_MESSAGES: Record<string, string> = {
  profile_missing: 'Sua conta está autenticada, mas não possui um profile administrativo.',
  profile_inactive: 'Seu profile administrativo está inativo.',
  role_forbidden: 'Sua role não permite acesso ao painel administrativo.',
  profile_query_failed: 'Não foi possível validar seu profile ou suas políticas de acesso.',
};

export const dynamic = 'force-dynamic';

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const filters = await searchParams;
  const message = filters.reason
    ? REASON_MESSAGES[filters.reason]
    : undefined;

  return (
    <main className="min-h-screen bg-slate-100 p-4 flex items-center justify-center">
      <section className="w-full max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldX className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Acesso negado</h1>
          <p className="text-sm text-slate-600">
            {message || 'Sua conta não possui autorização para acessar esta área.'}
          </p>
          <p className="text-xs text-slate-500">
            Solicite a um administrador a ativação do profile e uma role permitida.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Voltar ao site
          </Link>
        </div>
      </section>
    </main>
  );
}
