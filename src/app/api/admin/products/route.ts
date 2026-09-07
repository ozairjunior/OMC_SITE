import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/server';
import { productSchema } from '@/lib/validations/product';
import { slugifyProductName } from '@/lib/products/slug';
import { productConflictMessage } from '@/lib/products/database-errors';

export async function POST(request: Request) {
  try {
    const authorization = await requireAdminApi(request);
    if (!authorization.ok) return authorization.response;
    const { supabase, user } = authorization;

    const validation = productSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const payload = { ...validation.data, slug: slugifyProductName(validation.data.name) };
    const { data: productId, error } = await supabase.rpc('admin_save_product', {
      p_product_id: null,
      p_payload: payload,
      p_user_id: user.id,
    });

    if (error || !productId) {
      const conflictMessage = productConflictMessage(error);
      const status = conflictMessage ? 409 : 500;
      console.error('Erro transacional ao cadastrar produto:', error);
      return NextResponse.json(
        { error: conflictMessage ?? 'Erro ao cadastrar produto.' },
        { status }
      );
    }

    return NextResponse.json({ success: true, productId }, { status: 201 });
  } catch (error) {
    console.error('Erro interno na rota de produtos:', error);
    return NextResponse.json({ error: 'Erro interno de servidor' }, { status: 500 });
  }
}
