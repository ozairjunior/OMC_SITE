-- ============================================================================
-- SCRIPT DE CONFIGURAÇÃO DO BUCKET DE IMAGENS E POLÍTICAS RLS
-- BANCO: PostgreSQL (Supabase Storage)
-- DATA: 2026-07-29
-- ============================================================================

-- 1. Criação do Bucket de Armazenamento (se não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- Limite de 5MB por arquivo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

-- 2. Habilitar RLS na tabela de objetos do Storage
-- storage.objects ja possui RLS habilitado pelo Supabase.
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Política: Leitura pública para qualquer visitante do catálogo
DROP POLICY IF EXISTS "Acesso público às imagens dos produtos" ON storage.objects;
CREATE POLICY "Acesso público às imagens dos produtos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- 4. Política: Apenas usuários autenticados (Admins) podem enviar arquivos
DROP POLICY IF EXISTS "Upload de imagens por administradores" ON storage.objects;
CREATE POLICY "Upload de imagens por administradores"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images');

-- 5. Política: Apenas usuários autenticados podem deletar imagens
DROP POLICY IF EXISTS "Exclusão de imagens por administradores" ON storage.objects;
CREATE POLICY "Exclusão de imagens por administradores"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images');
