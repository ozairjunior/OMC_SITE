import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/server';
import { z } from 'zod';
import { normalizeProductImage } from '@/lib/images/normalize';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authorization = await requireAdminApi(request);
    if (!authorization.ok) return authorization.response;
    const { supabase } = authorization;

    const productId = id;
    if (!z.string().uuid().safeParse(productId).success) {
      return NextResponse.json({ error: 'Produto inválido' }, { status: 400 });
    }
    const { data: product } = await supabase
      .from('products').select('id').eq('id', productId).maybeSingle();
    if (!product) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    // O MIME e o nome enviados pelo cliente não são usados como prova do formato.
    if (file.size > 5 * 1024 * 1024) { // 5MB
      return NextResponse.json(
        { error: 'O arquivo excede o limite de 5MB.' },
        { status: 400 }
      );
    }

    // 3. Gerar caminho único do arquivo no bucket
    let normalized;
    try {
      normalized = await normalizeProductImage(Buffer.from(await file.arrayBuffer()));
    } catch {
      return NextResponse.json({ error: 'Imagem inválida ou formato não suportado.' }, { status: 400 });
    }
    const filePath = `products/${productId}/${crypto.randomUUID()}.${normalized.extension}`;

    // 4. Upload para o Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, normalized.buffer, {
        contentType: normalized.contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Erro no upload para o Storage:', uploadError);
      return NextResponse.json({ error: 'Erro ao salvar imagem no servidor' }, { status: 500 });
    }

    const { count: imageCount } = await supabase
      .from('product_images')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId);
    const shouldBePrimary = (imageCount || 0) === 0;

    // 6. Inserção na tabela relacional product_images
    const { data: imageRecord, error: dbError } = await supabase
      .from('product_images')
      .insert({
        product_id: productId,
        storage_path: filePath,
        alt_text: null,
        is_primary: false,
      })
      .select('id, storage_path, is_primary')
      .single();

    if (dbError) {
      // Reverter upload caso ocorra falha na gravação do banco
      await supabase.storage.from('product-images').remove([filePath]);
      return NextResponse.json({ error: 'Erro ao vincular imagem ao produto' }, { status: 500 });
    }

    if (shouldBePrimary) {
      const { error: primaryError } = await supabase.rpc('admin_set_primary_product_image', {
        p_product_id: productId,
        p_image_id: imageRecord.id,
      });
      if (primaryError) {
        await supabase.from('product_images').delete().eq('id', imageRecord.id);
        await supabase.storage.from('product-images').remove([filePath]);
        return NextResponse.json({ error: 'Erro ao definir imagem principal' }, { status: 500 });
      }
      imageRecord.is_primary = true;
    }

    const { data: signed } = await supabase.storage.from('product-images').createSignedUrl(filePath, 3600);
    return NextResponse.json({ success: true, image: { ...imageRecord, storage_path: signed?.signedUrl || '', storagePath: filePath } });
  } catch (error) {
    console.error('Erro interno ao processar upload:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
