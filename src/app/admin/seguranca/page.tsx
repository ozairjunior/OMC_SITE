import { requireAdminSetupPage } from '@/lib/auth/server';
import { MfaSetup } from '@/components/admin/MfaSetup';

export default async function SecurityPage() {
  await requireAdminSetupPage();
  return <main className="mx-auto max-w-lg p-6"><div className="rounded-2xl border bg-white p-8 shadow-sm space-y-5">
    <h1 className="text-xl font-bold">Segurança do painel</h1>
    <p className="text-sm text-slate-600">A autenticação multifator protege alterações de preços, estoque e pedidos.</p>
    <MfaSetup />
  </div></main>;
}
