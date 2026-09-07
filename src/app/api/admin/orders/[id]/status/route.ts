import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/server';
import { z } from 'zod';

const orderStatusSchema = z.enum([
  'cart_created',
  'checkout_started',
  'request_created',
  'whatsapp_clicked',
  'contacted',
  'quoted',
  'confirmed',
  'cancelled',
  'completed',
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authorization = await requireAdminApi(request);
    if (!authorization.ok) return authorization.response;
    const { supabase, user } = authorization;

    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
    }
    const validation = z.object({ status: orderStatusSchema }).safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('admin_transition_order_status', {
      p_order_id: id,
      p_new_status: validation.data.status,
      p_user_id: user.id,
    });
    if (error) {
      const notFound = error.message.includes('OMC_ORDER_NOT_FOUND');
      const invalidTransition = error.message.includes('OMC_INVALID_TRANSITION');
      const stockConflict = error.message.includes('OMC_STOCK_CONFLICT') || error.message.includes('Estoque insuficiente');
      const status = notFound ? 404 : invalidTransition || stockConflict ? 409 : 500;
      const message = notFound
        ? 'Pedido não encontrado.'
        : invalidTransition
          ? 'Essa transição de status não é permitida.'
          : stockConflict
            ? 'Estoque insuficiente para confirmar o pedido.'
            : 'Erro ao atualizar pedido.';
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ success: true, ...(data as object) });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
