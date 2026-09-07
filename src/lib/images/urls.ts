import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

export async function signedProductImageUrls<T extends { storage_path: string }>(images: T[]) {
  const supabase = createServiceClient();
  const signed = await Promise.all(images.map(async (image) => {
    // Corrige registros antigos que armazenaram uma URL assinada em vez do path.
    const storagePath = image.storage_path.startsWith('http')
      ? image.storage_path.match(/(products\/[^?]+)/)?.[1]
      : image.storage_path;
    if (!storagePath) return null;
    const { data } = await supabase.storage.from('product-images').createSignedUrl(storagePath, 3600);
    return data?.signedUrl ? { ...image, storage_path: data.signedUrl, storagePath } : null;
  }));
  return signed.filter((image): image is NonNullable<typeof image> => image !== null);
}
