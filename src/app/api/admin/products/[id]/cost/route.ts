import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/server';

const schema = z.object({ purchasePrice: z.number().finite().min(0) });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'COST_INVALID', message: 'Preço de compra inválido.' } }, { status: 400 });
  const { id } = await params;
  const { data, error } = await auth.supabase.rpc('admin_update_product_cost', {
    p_product_id: id,
    p_purchase_price: parsed.data.purchasePrice,
    p_user_id: auth.user.id,
  });
  if (error) return NextResponse.json({ error: { code: 'COST_SAVE_FAILED', message: 'Não foi possível salvar o preço de compra.' } }, { status: 500 });
  return NextResponse.json(data);
}
