import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/server';
import { z } from 'zod';

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const authorization = await requireAdminApi(_request);
  if (!authorization.ok) return authorization.response;
  const { supabase } = authorization;
  const { id, imageId } = await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(imageId).success) {
    return NextResponse.json({ error: 'Imagem inválida' }, { status: 400 });
  }
  const { data, error } = await supabase.rpc('admin_set_primary_product_image', {
    p_product_id: id,
    p_image_id: imageId,
  });
  if (error) return NextResponse.json({ error: 'Erro ao definir imagem principal' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Imagem não encontrada' }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  try {
    const { id, imageId } = await params;
    const authorization = await requireAdminApi(_request);
    if (!authorization.ok) return authorization.response;
    const { supabase } = authorization;

    if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(imageId).success) {
      return NextResponse.json({ error: 'Imagem inválida' }, { status: 400 });
    }
    const { data: image, error: queryError } = await supabase
      .from('product_images')
      .select('id, storage_path, is_primary')
      .eq('id', imageId)
      .eq('product_id', id)
      .maybeSingle();
    if (queryError) return NextResponse.json({ error: 'Erro ao consultar imagem' }, { status: 500 });
    if (!image) return NextResponse.json({ error: 'Imagem não encontrada' }, { status: 404 });

    const { error, count } = await supabase
      .from('product_images')
      .delete({ count: 'exact' })
      .eq('id', imageId)
      .eq('product_id', id);

    if (error) {
      return NextResponse.json({ error: 'Erro ao excluir registro da imagem' }, { status: 500 });
    }
    if (!count) return NextResponse.json({ error: 'Imagem não encontrada' }, { status: 404 });

    const { error: storageError } = await supabase.storage
      .from('product-images')
      .remove([image.storage_path]);
    if (storageError) console.error('Objeto órfão no Storage:', image.storage_path, storageError);

    if (image.is_primary) {
      const { data: nextImage } = await supabase
        .from('product_images').select('id').eq('product_id', id)
        .order('created_at').limit(1).maybeSingle();
      if (nextImage) {
        await supabase.rpc('admin_set_primary_product_image', {
          p_product_id: id,
          p_image_id: nextImage.id,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
