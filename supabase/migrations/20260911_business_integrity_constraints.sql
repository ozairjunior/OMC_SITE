-- Regras de integridade que devem valer mesmo quando o banco e acessado sem a UI.
-- As constraints sao NOT VALID para permitir auditoria/correcao antes da validacao.
BEGIN;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_promotional_price_below_price;
ALTER TABLE public.products ADD CONSTRAINT products_promotional_price_below_price
  CHECK (promotional_price IS NULL OR promotional_price < price) NOT VALID;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_totals_nonnegative;
ALTER TABLE public.orders ADD CONSTRAINT orders_totals_nonnegative
  CHECK (subtotal >= 0 AND total >= 0) NOT VALID;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_values_valid;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_values_valid
  CHECK (quantity > 0 AND unit_price >= 0 AND total_price >= 0) NOT VALID;
REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_logs FROM anon, authenticated;
DROP POLICY IF EXISTS "Staff Read Orders" ON public.orders;
CREATE POLICY "Staff Read Orders" ON public.orders FOR SELECT TO authenticated
  USING (public.has_role(ARRAY['admin', 'manager', 'attendant']::public.user_role[]));
DROP POLICY IF EXISTS "Staff Read Order Items" ON public.order_items;
CREATE POLICY "Staff Read Order Items" ON public.order_items FOR SELECT TO authenticated
  USING (public.has_role(ARRAY['admin', 'manager', 'attendant']::public.user_role[]));
COMMIT;
