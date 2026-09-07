import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/server';

const inputSchema = z.object({ name: z.string().trim().min(2).max(100) });

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  let query = auth.supabase.from('brands').select('id,name,slug,is_active,created_at,updated_at,products(count)').order('name');
  if (q) query = query.ilike('name', `%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'BRAND_LIST_FAILED', message: 'Não foi possível carregar marcas.' } }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'BRAND_INVALID', message: 'Nome de marca inválido.' } }, { status: 400 });
  const { data, error } = await auth.supabase.rpc('admin_create_brand', { p_name: parsed.data.name, p_user_id: auth.user.id });
  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: { code: 'BRAND_CREATE_FAILED', message: status === 409 ? 'Já existe uma marca com esse nome.' : 'Não foi possível cadastrar marca.' } }, { status });
  }
  return NextResponse.json(data, { status: 201 });
}
