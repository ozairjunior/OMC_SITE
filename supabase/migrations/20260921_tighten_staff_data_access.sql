DROP POLICY IF EXISTS "Staff Read Orders" ON public.orders;
CREATE POLICY "Staff Read Orders" ON public.orders FOR SELECT TO authenticated
  USING (public.has_role(ARRAY['admin', 'manager']::public.user_role[]));
DROP POLICY IF EXISTS "Staff Read Order Items" ON public.order_items;
CREATE POLICY "Staff Read Order Items" ON public.order_items FOR SELECT TO authenticated
  USING (public.has_role(ARRAY['admin', 'manager']::public.user_role[]));
