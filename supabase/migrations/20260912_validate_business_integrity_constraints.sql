-- Execute apos a auditoria indicada em docs/DEPLOYMENT.md.
BEGIN;
ALTER TABLE public.products VALIDATE CONSTRAINT products_promotional_price_below_price;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_totals_nonnegative;
ALTER TABLE public.order_items VALIDATE CONSTRAINT order_items_values_valid;
COMMIT;
