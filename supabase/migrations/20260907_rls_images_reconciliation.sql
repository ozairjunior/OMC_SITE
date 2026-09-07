-- Fecha a exposição de catálogo arquivado e torna o Storage privado.
BEGIN;
DROP POLICY IF EXISTS "Public Read Images" ON public.product_images;
CREATE POLICY "Public Read Images" ON public.product_images FOR SELECT TO PUBLIC USING (
  EXISTS (SELECT 1 FROM public.products product WHERE product.id = product_images.product_id AND product.is_active = true)
  OR public.has_role(ARRAY['admin', 'manager']::public.user_role[])
);
DROP POLICY IF EXISTS "Public Read Variants" ON public.product_variants;
CREATE POLICY "Public Read Variants" ON public.product_variants FOR SELECT TO PUBLIC USING (
  (product_variants.is_active = true AND EXISTS (SELECT 1 FROM public.products product
    WHERE product.id = product_variants.product_id AND product.is_active = true))
  OR public.has_role(ARRAY['admin', 'manager']::public.user_role[])
);
UPDATE storage.buckets SET public = false WHERE id = 'product-images';
DROP POLICY IF EXISTS "Acesso público às imagens dos produtos" ON storage.objects;
CREATE POLICY "Acesso público às imagens dos produtos" ON storage.objects FOR SELECT TO anon, authenticated USING (
  bucket_id = 'product-images' AND split_part(name, '/', 1) = 'products'
  AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
  AND EXISTS (SELECT 1 FROM public.products product
    WHERE product.id = split_part(storage.objects.name, '/', 2)::uuid AND product.is_active = true)
);
COMMIT;
