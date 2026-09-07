-- ============================================================================
-- SCRIPT DE LIMPEZA DE DADOS DE TESTE AUTOMATIZADO
-- BANCO: PostgreSQL (Supabase)
-- DATA: 2026-07-30
-- ============================================================================

-- Consulta de conferência antes de deletar
DO $$ BEGIN
  RAISE NOTICE 'Nenhuma limpeza destrutiva de dados de teste foi executada.';
END $$;
