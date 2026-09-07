import { requireAdminPage } from '@/lib/auth/server';
import { OrderStatusSelect } from '@/components/admin/OrderStatusSelect';
import { Phone, MapPin, Calendar, ShoppingBag } from 'lucide-react';
import Link from 'next/link';

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const { supabase } = await requireAdminPage();
  const filters = await searchParams;
  const page = Math.max(1, Number.parseInt(filters.pagina || '1', 10) || 1);
  const pageSize = 25;

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id,
      public_code,
      customer_name,
      customer_phone,
      neighborhood,
      city,
      total,
      status,
      created_at,
      order_items (
        id,
        product_name_snapshot,
        variant_name_snapshot,
        quantity,
        unit_snapshot,
        total_price
      )
    `)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    return <div className="p-6 text-red-600">Erro ao carregar pedidos.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestão de Pedidos & Orçamentos 📋</h1>
          <p className="text-sm text-slate-500">Acompanhe as solicitações recebidas pelo catálogo</p>
        </div>
      </div>

      <div className="space-y-4">
        {orders?.map((order: any) => (
          <div
            key={order.id}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3 gap-2">
              <div className="flex items-center space-x-3">
                <span className="font-mono text-sm font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded">
                  {order.public_code}
                </span>
                <span className="font-semibold text-slate-900">{order.customer_name}</span>
              </div>
              <OrderStatusSelect orderId={order.id} currentStatus={order.status} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
              <div className="flex items-center space-x-1.5">
                <Phone className="h-4 w-4 text-slate-400" />
                <span>{order.customer_phone}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <MapPin className="h-4 w-4 text-slate-400" />
                <span>{order.neighborhood} - {order.city}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span>{new Date(order.created_at).toLocaleString('pt-BR')}</span>
              </div>
            </div>

            {/* Itens do Pedido */}
            <div className="bg-slate-50 p-3 rounded-lg space-y-1.5 text-xs">
              <div className="font-semibold text-slate-700 flex items-center space-x-1 mb-1">
                <ShoppingBag className="h-3.5 w-3.5" />
                <span>Itens Solicitados:</span>
              </div>
              {order.order_items?.map((item: any) => (
                <div key={item.id} className="flex justify-between text-slate-600">
                  <span>
                    • {item.product_name_snapshot} ({item.variant_name_snapshot}) — {item.quantity} {item.unit_snapshot}
                  </span>
                  <span className="font-medium text-slate-800">R$ {Number(item.total_price).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t pt-1.5 text-right font-bold text-slate-900 text-sm">
                Total: R$ {Number(order.total).toFixed(2)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-center items-center gap-3">
        {page > 1 && <Link href={`/admin/pedidos?pagina=${page - 1}`} className="px-3 py-2 border rounded-lg text-sm">Anterior</Link>}
        <span className="text-sm text-slate-500">Página {page}</span>
        {orders?.length === pageSize && <Link href={`/admin/pedidos?pagina=${page + 1}`} className="px-3 py-2 border rounded-lg text-sm">Próxima</Link>}
      </div>
    </div>
  );
}
