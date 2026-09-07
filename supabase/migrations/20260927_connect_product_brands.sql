-- Conecta definitivamente products.brand_id ao cadastro administrativo.
-- Esta migration é necessária também para bancos que já executaram uma versão
-- anterior de 20260926_save_product_barcodes.sql.
BEGIN;

ALTER FUNCTION public.admin_save_product(UUID, JSONB, UUID)
  RENAME TO admin_save_product_core;

REVOKE ALL ON FUNCTION public.admin_save_product_core(UUID, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_product(
  p_product_id UUID,
  p_payload JSONB,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_brand_id UUID := NULLIF(p_payload->>'brandId', '')::UUID;
  v_brand_name TEXT;
  v_old_brand_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id
    OR NOT public.has_role(ARRAY['admin', 'manager']::public.user_role[]) THEN
    RAISE EXCEPTION 'Acesso administrativo negado.';
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT brand_id INTO v_old_brand_id
    FROM public.products
    WHERE id = p_product_id
    FOR UPDATE;
  END IF;

  IF v_brand_id IS NOT NULL THEN
    SELECT name INTO v_brand_name
    FROM public.brands
    WHERE id = v_brand_id
      AND (is_active = true OR id = v_old_brand_id);

    IF v_brand_name IS NULL THEN
      RAISE EXCEPTION 'Marca inexistente ou inativa.' USING ERRCODE = '23514';
    END IF;
  END IF;

  v_product_id := public.admin_save_product_core(
    p_product_id,
    p_payload,
    p_user_id
  );

  UPDATE public.products
  SET
    brand_id = v_brand_id,
    brand = v_brand_name,
    updated_at = NOW()
  WHERE id = v_product_id;

  IF v_old_brand_id IS DISTINCT FROM v_brand_id THEN
    INSERT INTO public.admin_audit_logs(
      user_id, action, entity_type, entity_id, old_data, new_data
    ) VALUES (
      p_user_id,
      'product_brand_changed',
      'products',
      v_product_id,
      jsonb_build_object('brand_id', v_old_brand_id),
      jsonb_build_object('brand_id', v_brand_id, 'brand', v_brand_name)
    );
  END IF;

  RETURN v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_product(UUID, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_product(UUID, JSONB, UUID) TO authenticated;

COMMIT;
