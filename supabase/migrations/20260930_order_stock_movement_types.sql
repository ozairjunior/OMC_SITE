-- Registra confirmações e cancelamentos de pedidos com tipo operacional correto.
CREATE OR REPLACE FUNCTION public.handle_order_confirmation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item RECORD;
BEGIN
  IF NEW.status = 'confirmed' AND OLD.stock_committed_at IS NULL THEN
    PERFORM set_config('app.stock_movement_type','sale',true);
    PERFORM set_config('app.stock_movement_reason','Saída referente ao pedido ' || NEW.id,true);
    FOR v_item IN SELECT variant_id,quantity FROM public.order_items WHERE order_id=NEW.id LOOP
      IF v_item.variant_id IS NULL THEN RAISE EXCEPTION 'Pedido possui item sem variacao ativa para controle de estoque.'; END IF;
      UPDATE public.product_variants SET stock_quantity=stock_quantity-v_item.quantity WHERE id=v_item.variant_id AND stock_quantity>=v_item.quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'Estoque insuficiente ao confirmar o pedido.'; END IF;
    END LOOP;
    NEW.stock_committed_at=NOW(); NEW.confirmed_at=COALESCE(NEW.confirmed_at,NOW());
  END IF;
  IF NEW.status='cancelled' AND OLD.stock_committed_at IS NOT NULL AND OLD.status<>'completed' THEN
    PERFORM set_config('app.stock_movement_type','return',true);
    PERFORM set_config('app.stock_movement_reason','Devolução referente ao pedido ' || NEW.id,true);
    FOR v_item IN SELECT variant_id,quantity FROM public.order_items WHERE order_id=NEW.id LOOP
      IF v_item.variant_id IS NOT NULL THEN UPDATE public.product_variants SET stock_quantity=stock_quantity+v_item.quantity WHERE id=v_item.variant_id; END IF;
    END LOOP;
    NEW.stock_committed_at=NULL;
  END IF;
  IF NEW.status='completed' AND OLD.status<>'completed' THEN NEW.completed_at=NOW(); END IF;
  RETURN NEW;
END; $$;
