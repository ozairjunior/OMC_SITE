-- Execute a auditoria abaixo antes desta migration e corrija qualquer linha retornada.
-- Depois disso, VALIDATE deixa as constraints aplicadas também aos dados antigos.
BEGIN;
ALTER TABLE public.products VALIDATE CONSTRAINT products_quantity_rules;
ALTER TABLE public.product_variants VALIDATE CONSTRAINT product_variants_stock_rules;
COMMIT;
