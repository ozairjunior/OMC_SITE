import { createClient } from '@/lib/supabase/server';
import { ShoppingBag, MessageSquare, AlertTriangle, TrendingUp } from 'lucide-react';

export async function MetricsOverview() {
  const supabase = await createClient();

  // Executar consultas agregadas em paralelo
  const [
    { count: totalOrders },
    { count: whatsappClicks },
    { data: lowStockVariants },
    { data: recentOrders }
  ] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event_name', 'whatsapp_clicked'),
    supabase.from('product_variants').select('id, name, stock_quantity, low_stock_threshold').lte('stock_quantity', 5),
    supabase.from('orders').select('id, public_code, customer_name, total, status, created_at').order('created_at', { ascending: false }).limit(5)
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Total de Pedidos</p>
            <p className="text-2xl font-bold text-slate-900">{totalOrders || 0}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Cliques WhatsApp</p>
            <p className="text-2xl font-bold text-slate-900">{whatsappClicks || 0}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Estoque Baixo</p>
            <p className="text-2xl font-bold text-slate-900">{lowStockVariants?.length || 0}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Taxa Conversão</p>
            <p className="text-2xl font-bold text-slate-900">
              {totalOrders && whatsappClicks ? ((whatsappClicks / totalOrders) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </div>
      </div>

      {/* Tabela de Pedidos Recentes */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Solicitações Recentes de Orçamento</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="p-3">Código</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
                <th className="p-3">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentOrders?.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs font-bold text-amber-700">{order.public_code}</td>
                  <td className="p-3 text-slate-800">{order.customer_name}</td>
                  <td className="p-3 font-medium">R$ {Number(order.total).toFixed(2)}</td>
                  <td className="p-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                      {order.status}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 text-xs">
                    {new Date(order.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
