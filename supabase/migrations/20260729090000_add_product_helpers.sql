-- ============================================================================
-- SCRIPT DE PROCEDIMENTOS DE APOIO AO CATALOGO DE PRODUTOS
-- BANCO: PostgreSQL (Supabase)
-- DATA: 2026-07-29
-- ============================================================================

-- Função para atualizar automaticamente a data de alteração (updated_at)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para tabela de produtos
DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Trigger para tabela de variações
DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON product_variants;
CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Garantir índice de busca para termos do produto
CREATE TABLE IF NOT EXISTS public.product_search_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  term TEXT NOT NULL CHECK (length(btrim(term)) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, term)
);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.product_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_search_terms_product_id
  ON public.product_search_terms(product_id);
CREATE INDEX IF NOT EXISTS idx_search_terms_term_trgm
  ON public.product_search_terms USING gin (term gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_admin_audit_entity
  ON public.admin_audit_logs(entity_type, entity_id, created_at DESC);
