-- Garante que qualquer alteracao de saldo, inclusive legada, deixe movimento.
BEGIN;
CREATE OR REPLACE FUNCTION public.record_stock_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type TEXT := COALESCE(current_setting('app.stock_movement_type', true), 'inventory_adjustment');
BEGIN
  IF NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity THEN
    INSERT INTO public.stock_movements(variant_id, type, quantity, previous_quantity, new_quantity, reason, user_id)
    VALUES (NEW.id, v_type, NEW.stock_quantity - OLD.stock_quantity, OLD.stock_quantity, NEW.stock_quantity,
      COALESCE(NULLIF(current_setting('app.stock_movement_reason', true), ''), 'Alteracao de estoque registrada automaticamente'), auth.uid());
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_record_stock_change ON public.product_variants;
CREATE TRIGGER trg_record_stock_change AFTER UPDATE OF stock_quantity ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.record_stock_change();
-- Evita duplicidade: a RPC usa o mesmo trigger como registro atomico.
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_variant_id UUID, p_delta NUMERIC, p_type TEXT, p_reason TEXT
) RETURNS public.stock_movements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old NUMERIC; v_new NUMERIC; v_row public.stock_movements;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_delta = 0 OR p_reason IS NULL OR length(btrim(p_reason)) < 3 OR p_type NOT IN ('purchase','sale','damage','inventory_adjustment','return') THEN RAISE EXCEPTION 'Movimentacao invalida'; END IF;
  SELECT stock_quantity INTO v_old FROM public.product_variants WHERE id = p_variant_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Variacao nao encontrada'; END IF;
  v_new := v_old + p_delta;
  IF v_new < 0 THEN RAISE EXCEPTION 'Estoque insuficiente'; END IF;
  PERFORM set_config('app.stock_movement_type', p_type, true);
  PERFORM set_config('app.stock_movement_reason', btrim(p_reason), true);
  UPDATE public.product_variants SET stock_quantity = v_new WHERE id = p_variant_id;
  SELECT * INTO v_row FROM public.stock_movements WHERE variant_id = p_variant_id ORDER BY created_at DESC, id DESC LIMIT 1;
  RETURN v_row;
END; $$;
COMMIT;
