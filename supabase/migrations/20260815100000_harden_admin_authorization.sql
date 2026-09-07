-- Alinha as políticas do banco com a autorização do painel: admin e manager.

DROP POLICY IF EXISTS "Upload de imagens por administradores" ON storage.objects;
CREATE POLICY "Upload de imagens por administradores"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.has_role(ARRAY['admin', 'manager']::public.user_role[])
  );

DROP POLICY IF EXISTS "Exclusão de imagens por administradores" ON storage.objects;
CREATE POLICY "Exclusão de imagens por administradores"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.has_role(ARRAY['admin', 'manager']::public.user_role[])
  );

-- Por padrão, views PostgreSQL podem executar com os privilégios do proprietário.
-- security_invoker faz as consultas respeitarem a RLS do usuário autenticado.
ALTER VIEW public.view_sales_funnel_summary SET (security_invoker = true);
ALTER VIEW public.view_top_requested_products SET (security_invoker = true);
