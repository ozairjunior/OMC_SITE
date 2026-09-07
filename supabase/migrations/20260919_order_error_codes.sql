-- Codigos estaveis para a API nao depender do texto exibido ao usuario.
CREATE OR REPLACE FUNCTION public.admin_transition_order_status(p_order_id UUID, p_new_status public.order_status, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE; v_allowed BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION USING MESSAGE = 'OMC_ADMIN_FORBIDDEN'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'OMC_ORDER_NOT_FOUND'; END IF;
  IF v_order.status = p_new_status THEN RETURN jsonb_build_object('status', v_order.status); END IF;
  v_allowed := CASE v_order.status
    WHEN 'cart_created' THEN p_new_status IN ('checkout_started','cancelled')
    WHEN 'checkout_started' THEN p_new_status IN ('request_created','whatsapp_clicked','cancelled')
    WHEN 'request_created' THEN p_new_status IN ('whatsapp_clicked','contacted','quoted','confirmed','cancelled')
    WHEN 'whatsapp_clicked' THEN p_new_status IN ('contacted','quoted','confirmed','cancelled')
    WHEN 'contacted' THEN p_new_status IN ('quoted','confirmed','cancelled')
    WHEN 'quoted' THEN p_new_status IN ('contacted','confirmed','cancelled')
    WHEN 'confirmed' THEN p_new_status IN ('completed','cancelled') ELSE false END;
  IF NOT v_allowed THEN RAISE EXCEPTION USING MESSAGE = 'OMC_INVALID_TRANSITION'; END IF;
  UPDATE public.orders SET status = p_new_status, updated_at = now() WHERE id = p_order_id;
  INSERT INTO public.admin_audit_logs(user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_user_id, 'order_status_changed', 'orders', p_order_id, jsonb_build_object('status', v_order.status), jsonb_build_object('status', p_new_status));
  RETURN jsonb_build_object('status', p_new_status);
END; $$;
