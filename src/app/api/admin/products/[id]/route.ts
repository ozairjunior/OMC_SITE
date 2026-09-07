import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/server';
import { productSchema } from '@/lib/validations/product';
import { productConflictMessage } from '@/lib/products/database-errors';

const uuidSchema = z.string().uuid();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authorization = await requireAdminApi(request);
    if (!authorization.ok) return authorization.response;
    const { supabase, user } = authorization;

    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'ID de produto inválido' }, { status: 400 });
    }
    const validation = productSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { data: currentProduct, error: currentProductError } = await supabase
      .from('products')
      .select('id, slug, sku')
      .eq('id', id)
      .maybeSingle();
    if (currentProductError) {
      console.error('Erro ao consultar identificadores do produto:', currentProductError);
      return NextResponse.json({ error: 'Erro ao atualizar produto.' }, { status: 500 });
    }
    if (!currentProduct) {
      return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 });
    }

    const payload = {
      ...validation.data,
      slug: currentProduct.slug,
      sku: currentProduct.sku,
    };
    const { data: productId, error } = await supabase.rpc('admin_save_product', {
      p_product_id: id,
      p_payload: payload,
      p_user_id: user.id,
    });
    if (error || !productId) {
      const conflictMessage = productConflictMessage(error);
      const status = conflictMessage ? 409 : 500;
      console.error('Erro transacional ao atualizar produto:', error);
      return NextResponse.json(
        { error: conflictMessage ?? 'Erro ao atualizar produto.' },
        { status }
      );
    }
    if (validation.data.purchasePrice === null) {
      const { error: costError } = await supabase.rpc('admin_remove_product_cost', { p_product_id: id, p_user_id: user.id });
      if (costError) return NextResponse.json({ error: 'Erro ao remover preço de compra.' }, { status: 500 });
    }
    return NextResponse.json({ success: true, productId });
  } catch (error) {
    console.error('Erro interno ao atualizar produto:', error);
    return NextResponse.json({ error: 'Erro interno ao atualizar produto.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authorization = await requireAdminApi(_request);
    if (!authorization.ok) return authorization.response;
    const { supabase, user } = authorization;

    if (!uuidSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'ID de produto inválido' }, { status: 400 });
    }
    const { data, error } = await supabase.rpc('admin_archive_product', {
      p_product_id: id,
      p_user_id: user.id,
    });
    if (error) {
      console.error('Erro ao arquivar produto:', error);
      return NextResponse.json({ error: 'Erro ao arquivar produto.' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro interno ao arquivar produto:', error);
    return NextResponse.json({ error: 'Erro interno ao arquivar produto.' }, { status: 500 });
  }
}
