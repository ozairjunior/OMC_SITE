-- ============================================================================
-- SCRIPT DE VIEWS E FUNÇÕES PARA O DASHBOARD ANALÍTICO
-- BANCO: PostgreSQL (Supabase)
-- DATA: 2026-07-30
-- ============================================================================

-- 1. View para Agregação das Etapas do Funil de Vendas
CREATE OR REPLACE VIEW view_sales_funnel_summary AS
SELECT
  status,
  COUNT(*) AS total_orders,
  COALESCE(SUM(total), 0) AS aggregate_value
FROM orders
GROUP BY status;

-- 2. View para Top Produtos Mais Solicitados nos Orçamentos
CREATE OR REPLACE VIEW view_top_requested_products AS
SELECT
  oi.product_name_snapshot AS product_name,
  oi.unit_snapshot AS unit,
  SUM(oi.quantity) AS total_quantity,
  SUM(oi.total_price) AS total_revenue,
  COUNT(DISTINCT oi.order_id) AS total_orders_appeared
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status NOT IN ('cancelled')
GROUP BY oi.product_name_snapshot, oi.unit_snapshot
ORDER BY total_revenue DESC
LIMIT 10;

-- 3. Índices de Otimização para Consultas por Data
CREATE INDEX IF NOT EXISTS idx_orders_created_at_status ON orders(created_at, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);