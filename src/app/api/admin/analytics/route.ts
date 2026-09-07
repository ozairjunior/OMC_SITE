import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authorization = await requireAdminApi(request);
    if (!authorization.ok) return authorization.response;
    const { supabase } = authorization;

    // 2. Consulta agregada do Funil de Vendas
    const { data: funnelData, error: funnelError } = await supabase
      .from('view_sales_funnel_summary')
      .select('*');

    if (funnelError) {
      console.error('Erro na view de funil:', funnelError);
      return NextResponse.json({ error: 'Erro ao carregar dados do funil' }, { status: 500 });
    }

    // 3. Consulta dos Produtos Mais Vendidos / Solicitados
    const { data: topProducts, error: topProductsError } = await supabase
      .from('view_top_requested_products')
      .select('*');

    if (topProductsError) {
      console.error('Erro na view de top produtos:', topProductsError);
      return NextResponse.json({ error: 'Erro ao carregar top produtos' }, { status: 500 });
    }

    // 4. Cálculo dos KPIs Consolidados
    const totalOrders = funnelData?.reduce((acc, curr) => acc + Number(curr.total_orders), 0) || 0;
    const confirmedOrders = funnelData?.filter(item => 
      ['confirmed', 'completed'].includes(item.status)
    ) || [];

    const totalRevenue = confirmedOrders.reduce((acc, curr) => acc + Number(curr.aggregate_value), 0);
    const confirmedCount = confirmedOrders.reduce((acc, curr) => acc + Number(curr.total_orders), 0);
    const conversionRate = totalOrders > 0 ? ((confirmedCount / totalOrders) * 100).toFixed(1) : '0';
    const averageTicket = confirmedCount > 0 ? (totalRevenue / confirmedCount).toFixed(2) : '0.00';

    return NextResponse.json({
      kpis: {
        totalOrders,
        totalRevenue,
        conversionRate,
        averageTicket,
      },
      funnel: funnelData || [],
      topProducts: topProducts || [],
    });
  } catch (error) {
    console.error('Erro interno ao carregar analytics:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
