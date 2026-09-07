-- Historico imutavel de entradas, saidas e ajustes de estoque.
BEGIN;
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'sale', 'damage', 'inventory_adjustment', 'return')),
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity <> 0),
  previous_quantity NUMERIC(10,2) NOT NULL CHECK (previous_quantity >= 0),
  new_quantity NUMERIC(10,2) NOT NULL CHECK (new_quantity >= 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff Read Stock Movements" ON public.stock_movements;
CREATE POLICY "Staff Read Stock Movements" ON public.stock_movements FOR SELECT TO authenticated
  USING (public.has_role(ARRAY['admin','manager','attendant']::public.user_role[]));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.stock_movements FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_created ON public.stock_movements(variant_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_variant_id UUID, p_delta NUMERIC, p_type TEXT, p_reason TEXT
) RETURNS public.stock_movements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old NUMERIC; v_new NUMERIC; v_row public.stock_movements;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_delta = 0 OR p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'Movimentacao invalida'; END IF;
  SELECT stock_quantity INTO v_old FROM public.product_variants WHERE id = p_variant_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Variacao nao encontrada'; END IF;
  v_new := v_old + p_delta;
  IF v_new < 0 THEN RAISE EXCEPTION 'Estoque insuficiente'; END IF;
  UPDATE public.product_variants SET stock_quantity = v_new WHERE id = p_variant_id;
  INSERT INTO public.stock_movements(variant_id,type,quantity,previous_quantity,new_quantity,reason,user_id)
  VALUES (p_variant_id,p_type,p_delta,v_old,v_new,btrim(p_reason),auth.uid()) RETURNING * INTO v_row;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.adjust_stock(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
COMMIT;
