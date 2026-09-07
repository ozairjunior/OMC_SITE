import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/server';

const schema = z.object({ name: z.string().trim().min(2).max(100).optional(), isActive: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'BRAND_INVALID', message: 'Dados de marca inválidos.' } }, { status: 400 });
  const { id } = await params;
  const result = await auth.supabase.rpc('admin_update_brand', { p_brand_id: id, p_payload: parsed.data, p_user_id: auth.user.id });
  if (result.error) return NextResponse.json({ error: { code: 'BRAND_UPDATE_FAILED', message: result.error.code === '23505' ? 'Já existe uma marca com esse nome.' : 'Não foi possível atualizar marca.' } }, { status: result.error.code === '23505' ? 409 : 500 });
  return NextResponse.json(result.data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await auth.supabase.rpc('admin_update_brand', { p_brand_id: id, p_payload: { isActive: false }, p_user_id: auth.user.id });
  if (result.error) return NextResponse.json({ error: { code: 'BRAND_DELETE_FAILED', message: 'Não foi possível arquivar marca.' } }, { status: 500 });
  return NextResponse.json(result.data);
}
