-- ============================================================================
-- SCRIPT DE OTIMIZAÇÃO DE BUSCA E INDEXAÇÃO
-- BANCO: PostgreSQL (Supabase)
-- DATA: 2026-07-29
-- ============================================================================

-- Habilitar extensão pg_trgm para buscas de texto eficientes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices Trigrama para otimizar busca por fragmentos de texto (ilike '%termo%')
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm ON products USING gin (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON products USING gin (sku gin_trgm_ops);

-- Índice composto para filtro de produtos ativos por categoria
CREATE INDEX IF NOT EXISTS idx_products_category_active ON products (category_id, is_active);