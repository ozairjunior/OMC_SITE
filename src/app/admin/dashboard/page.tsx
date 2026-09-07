import { DollarSign, ShoppingCart, TrendingUp, PackageCheck } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/server';
import Link from 'next/link';

export default async function AdminDashboardPage() {
  const { supabase, profile } = await requireAdminPage();

  // Consulta das views analíticas protegidas
  const { data: funnelData, error: funnelError } = await supabase
    .from('view_sales_funnel_summary')
    .select('*');
  const { data: topProducts, error: topProductsError } = await supabase
    .from('view_top_requested_products')
    .select('*');
  const dataError = funnelError || topProductsError;

  const totalOrders = funnelData?.reduce((acc, curr) => acc + Number(curr.total_orders), 0) || 0;
  const confirmedOrders = funnelData?.filter(item => ['confirmed', 'completed'].includes(item.status)) || [];
  const confirmedValue = confirmedOrders.reduce((acc, curr) => acc + Number(curr.aggregate_value), 0);
  const confirmedCount = confirmedOrders.reduce((acc, curr) => acc + Number(curr.total_orders), 0);
  const conversionRate = totalOrders > 0 ? ((confirmedCount / totalOrders) * 100).toFixed(1) : '0';
  const averageTicket = confirmedCount > 0 ? (confirmedValue / confirmedCount).toFixed(2) : '0.00';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Comercial & Analytics 📊</h1>
          <p className="text-xs text-slate-500">
            {profile.full_name} · {profile.role} · Acompanhamento de orçamentos e catálogo
          </p>
        </div>
      </div>

      {dataError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>Não foi possível carregar os indicadores.</strong>{' '}
          {process.env.NODE_ENV === 'production' ? 'Tente novamente em instantes.' : `Diagnóstico: ${dataError.code || 'sem código'} — ${dataError.message}`}
        </div>
      )}

      <nav aria-label="Atalhos administrativos" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/admin/produtos" className="rounded-lg bg-amber-600 p-3 text-center text-sm font-bold text-white">Gerenciar produtos</Link>
        <Link href="/admin/produtos/novo" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-sm font-bold text-amber-800">Adicionar produto</Link>
        <Link href="/admin/pedidos" className="rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-bold text-slate-700">Ver pedidos</Link>
        {profile.role === 'admin' && <Link href="/admin/usuarios" className="rounded-lg border border-slate-200 bg-white p-3 text-center text-sm font-bold text-slate-700">Gerenciar usuários</Link>}
      </nav>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase block">Valor dos Pedidos Confirmados</span>
            <span className="text-2xl font-bold text-slate-900">R$ {confirmedValue.toFixed(2)}</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase block">Total de Solicitações</span>
            <span className="text-2xl font-bold text-slate-900">{totalOrders}</span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <ShoppingCart className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase block">Taxa de Conversão</span>
            <span className="text-2xl font-bold text-slate-900">{conversionRate}%</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase block">Ticket Médio Estimado</span>
            <span className="text-2xl font-bold text-slate-900">R$ {averageTicket}</span>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <PackageCheck className="h-6 w-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-900 text-base border-b pb-2">Distribuição de Status dos Pedidos</h2>
          <div className="space-y-3">
            {funnelData?.map((step) => (
              <div key={step.status} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span className="capitalize">{step.status.replace('_', ' ')}</span>
                  <span>{step.total_orders} pedidos (R$ {Number(step.aggregate_value).toFixed(2)})</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-600 h-full rounded-full transition-all"
                    style={{ width: `${totalOrders > 0 ? (step.total_orders / totalOrders) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-900 text-base border-b pb-2">Top 10 Produtos Mais Solicitados 🏆</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-800 font-bold border-b">
                <tr>
                  <th className="p-2.5">Produto</th>
                  <th className="p-2.5 text-center">Aparições</th>
                  <th className="p-2.5 text-center">Volume Total</th>
                  <th className="p-2.5 text-right">Valor Consolidado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {topProducts?.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-800">{item.product_name}</td>
                    <td className="p-2.5 text-center">{item.total_orders_appeared}</td>
                    <td className="p-2.5 text-center">{item.total_quantity} {item.unit}</td>
                    <td className="p-2.5 text-right font-bold text-slate-900">R$ {Number(item.total_revenue).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
