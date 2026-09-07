CREATE OR REPLACE FUNCTION public.admin_remove_product_cost(p_product_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cost public.product_costs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso administrativo negado.'; END IF;
  SELECT * INTO v_cost FROM public.product_costs WHERE product_id=p_product_id FOR UPDATE;
  IF v_cost.id IS NOT NULL THEN
    DELETE FROM public.product_costs WHERE id=v_cost.id;
    INSERT INTO public.admin_audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES (p_user_id,'purchase_price_changed','product_cost',v_cost.id,jsonb_build_object('purchase_price',v_cost.purchase_price),jsonb_build_object('purchase_price',NULL,'product_id',p_product_id));
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.admin_remove_product_cost(UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_product_cost(UUID,UUID) TO authenticated;
