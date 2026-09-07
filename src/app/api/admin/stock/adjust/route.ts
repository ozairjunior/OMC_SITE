import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/server';

const schema = z.object({ variantId: z.string().uuid(), delta: z.number().finite().refine((value) => value !== 0), type: z.enum(['purchase', 'sale', 'damage', 'inventory_adjustment', 'return']), reason: z.string().trim().max(500).optional().default('') }).superRefine((movement, context) => {
  if (['purchase', 'return'].includes(movement.type) && movement.delta <= 0) context.addIssue({ code: 'custom', path: ['delta'], message: 'Entradas e devoluções exigem quantidade positiva.' });
  if (['sale', 'damage'].includes(movement.type) && movement.delta >= 0) context.addIssue({ code: 'custom', path: ['delta'], message: 'Vendas e avarias exigem quantidade negativa.' });
});

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  if (!['admin', 'manager'].includes(auth.profile.role)) return NextResponse.json({ error: { code: 'STOCK_ADMIN_REQUIRED', message: 'Acesso negado.' } }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'STOCK_ADJUST_INVALID', message: 'Dados de movimentação inválidos.' } }, { status: 400 });
  const signedDelta = ['sale', 'damage'].includes(parsed.data.type) ? -Math.abs(parsed.data.delta) : parsed.data.type === 'inventory_adjustment' ? parsed.data.delta : Math.abs(parsed.data.delta);
  const reason = parsed.data.reason?.trim() || `Movimentação registrada: ${parsed.data.type}`;
  const { data, error } = await auth.supabase.rpc('adjust_stock', { p_variant_id: parsed.data.variantId, p_delta: signedDelta, p_type: parsed.data.type, p_reason: reason });
  if (error) return NextResponse.json({ error: { code: 'STOCK_ADJUST_FAILED', message: 'Não foi possível ajustar o estoque.' } }, { status: 409 });
  return NextResponse.json(data);
}
