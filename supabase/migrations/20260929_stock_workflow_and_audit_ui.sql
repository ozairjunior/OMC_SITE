-- Restringe estoque existente ao fluxo de movimentações e valida tipo/sinal.
BEGIN;

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_check
  CHECK (type IN ('opening_balance','purchase','sale','damage','inventory_adjustment','return'));
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_sign_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_sign_check CHECK (
  (type IN ('opening_balance','purchase','return') AND quantity > 0)
  OR (type IN ('sale','damage') AND quantity < 0)
  OR type = 'inventory_adjustment'
) NOT VALID;

CREATE OR REPLACE FUNCTION public.record_initial_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stock_quantity <> 0 THEN
    INSERT INTO public.stock_movements(variant_id,type,quantity,previous_quantity,new_quantity,reason,user_id)
    VALUES (NEW.id,'opening_balance',NEW.stock_quantity,0,NEW.stock_quantity,'Saldo inicial da variacao',auth.uid());
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_record_initial_stock ON public.product_variants;
CREATE TRIGGER trg_record_initial_stock AFTER INSERT ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.record_initial_stock();

DO $$
BEGIN
  IF to_regprocedure('public.admin_save_product_inventory_core(uuid,jsonb,uuid)') IS NULL
     AND to_regprocedure('public.admin_save_product(uuid,jsonb,uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.admin_save_product(UUID, JSONB, UUID)
      RENAME TO admin_save_product_inventory_core;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_save_product_inventory_core(UUID, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_product(p_product_id UUID, p_payload JSONB, p_user_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payload JSONB := p_payload; v_variant JSONB; v_variants JSONB := '[]'::JSONB;
  v_variant_id UUID; v_current_stock NUMERIC;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso administrativo negado.'; END IF;
  FOR v_variant IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'variants','[]'::JSONB)) LOOP
    v_variant_id := NULLIF(v_variant->>'id','')::UUID;
    IF v_variant_id IS NOT NULL THEN
      SELECT stock_quantity INTO v_current_stock FROM public.product_variants WHERE id=v_variant_id AND product_id=p_product_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Variacao nao pertence ao produto.' USING ERRCODE='23503'; END IF;
      v_variant := jsonb_set(v_variant,'{stockQuantity}',to_jsonb(v_current_stock),true);
    END IF;
    v_variants := v_variants || jsonb_build_array(v_variant);
  END LOOP;
  v_payload := jsonb_set(v_payload,'{variants}',v_variants,true);
  RETURN public.admin_save_product_inventory_core(p_product_id,v_payload,p_user_id);
END; $$;
REVOKE ALL ON FUNCTION public.admin_save_product(UUID, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_product(UUID, JSONB, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_stock(p_variant_id UUID,p_delta NUMERIC,p_type TEXT,p_reason TEXT)
RETURNS public.stock_movements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old NUMERIC; v_new NUMERIC; v_row public.stock_movements;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_delta = 0 OR p_reason IS NULL OR length(btrim(p_reason)) < 3 OR p_type NOT IN ('purchase','sale','damage','inventory_adjustment','return') THEN RAISE EXCEPTION 'Movimentacao invalida' USING ERRCODE='22023'; END IF;
  IF p_type IN ('purchase','return') AND p_delta <= 0 THEN RAISE EXCEPTION 'Esta movimentacao exige quantidade positiva' USING ERRCODE='22023'; END IF;
  IF p_type IN ('sale','damage') AND p_delta >= 0 THEN RAISE EXCEPTION 'Esta movimentacao exige quantidade negativa' USING ERRCODE='22023'; END IF;
  SELECT stock_quantity INTO v_old FROM public.product_variants WHERE id=p_variant_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Variacao nao encontrada' USING ERRCODE='P0002'; END IF;
  v_new := v_old + p_delta;
  IF v_new < 0 THEN RAISE EXCEPTION 'Estoque insuficiente' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.stock_movement_type',p_type,true);
  PERFORM set_config('app.stock_movement_reason',btrim(p_reason),true);
  UPDATE public.product_variants SET stock_quantity=v_new WHERE id=p_variant_id;
  SELECT * INTO v_row FROM public.stock_movements WHERE variant_id=p_variant_id ORDER BY created_at DESC,id DESC LIMIT 1;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.adjust_stock(UUID,NUMERIC,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID,NUMERIC,TEXT,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
