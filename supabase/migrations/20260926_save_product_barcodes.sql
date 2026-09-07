-- Persiste os GTINs informados no cadastro de produtos e variações.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_save_product(
  p_product_id UUID, p_payload JSONB, p_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product_id UUID; v_variant JSONB; v_variant_id UUID;
  v_submitted_variant_ids UUID[] := ARRAY[]::UUID[];
  v_old_product JSONB; v_archived_variant_ids UUID[] := ARRAY[]::UUID[];
  v_deleted_variant_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id
    OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN
    RAISE EXCEPTION 'Acesso administrativo negado.';
  END IF;
  IF jsonb_array_length(COALESCE(p_payload->'variants','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'O produto deve possuir ao menos uma variacao.';
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO public.products(category_id,name,slug,sku,barcode,brand_id,short_description,description,brand,unit,price,promotional_price,minimum_quantity,step_quantity,coverage_per_package,featured,is_active)
    VALUES ((p_payload->>'categoryId')::UUID,p_payload->>'name',p_payload->>'slug',NULLIF(p_payload->>'sku',''),NULLIF(p_payload->>'barcode',''),NULLIF(p_payload->>'brandId','')::UUID,NULLIF(p_payload->>'shortDescription',''),NULLIF(p_payload->>'description',''),NULLIF(p_payload->>'brand',''),p_payload->>'unit',(p_payload->>'price')::NUMERIC,(p_payload->>'promotionalPrice')::NUMERIC,(p_payload->>'minimumQuantity')::NUMERIC,(p_payload->>'stepQuantity')::NUMERIC,(p_payload->>'coveragePerPackage')::NUMERIC,COALESCE((p_payload->>'featured')::BOOLEAN,false),COALESCE((p_payload->>'isActive')::BOOLEAN,true))
    RETURNING id INTO v_product_id;
  ELSE
    SELECT to_jsonb(products) INTO v_old_product FROM public.products WHERE id=p_product_id FOR UPDATE;
    IF v_old_product IS NULL THEN RAISE EXCEPTION 'Produto nao encontrado.'; END IF;
    v_product_id := p_product_id;
    UPDATE public.products SET category_id=(p_payload->>'categoryId')::UUID,name=p_payload->>'name',slug=p_payload->>'slug',sku=NULLIF(p_payload->>'sku',''),barcode=NULLIF(p_payload->>'barcode',''),brand_id=NULLIF(p_payload->>'brandId','')::UUID,short_description=NULLIF(p_payload->>'shortDescription',''),description=NULLIF(p_payload->>'description',''),brand=NULLIF(p_payload->>'brand',''),unit=p_payload->>'unit',price=(p_payload->>'price')::NUMERIC,promotional_price=(p_payload->>'promotionalPrice')::NUMERIC,minimum_quantity=(p_payload->>'minimumQuantity')::NUMERIC,step_quantity=(p_payload->>'stepQuantity')::NUMERIC,coverage_per_package=(p_payload->>'coveragePerPackage')::NUMERIC,featured=COALESCE((p_payload->>'featured')::BOOLEAN,false),is_active=COALESCE((p_payload->>'isActive')::BOOLEAN,true),updated_at=NOW() WHERE id=v_product_id;
  END IF;

  FOR v_variant IN SELECT value FROM jsonb_array_elements(p_payload->'variants') LOOP
    v_variant_id := NULLIF(v_variant->>'id','')::UUID;
    IF v_variant_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id=v_variant_id AND product_id=v_product_id) THEN RAISE EXCEPTION 'Variacao nao pertence ao produto.'; END IF;
      UPDATE public.product_variants SET name=v_variant->>'name',sku=NULLIF(v_variant->>'sku',''),barcode=NULLIF(v_variant->>'barcode',''),color=NULLIF(v_variant->>'color',''),size=NULLIF(v_variant->>'size',''),length=NULLIF(v_variant->>'length',''),price_adjustment=COALESCE((v_variant->>'priceAdjustment')::NUMERIC,0),stock_quantity=COALESCE((v_variant->>'stockQuantity')::NUMERIC,0),low_stock_threshold=COALESCE((v_variant->>'lowStockThreshold')::NUMERIC,5),is_active=COALESCE((v_variant->>'isActive')::BOOLEAN,true),updated_at=NOW() WHERE id=v_variant_id;
    ELSE
      INSERT INTO public.product_variants(product_id,name,sku,barcode,color,size,length,price_adjustment,stock_quantity,low_stock_threshold,is_active)
      VALUES (v_product_id,v_variant->>'name',NULLIF(v_variant->>'sku',''),NULLIF(v_variant->>'barcode',''),NULLIF(v_variant->>'color',''),NULLIF(v_variant->>'size',''),NULLIF(v_variant->>'length',''),COALESCE((v_variant->>'priceAdjustment')::NUMERIC,0),COALESCE((v_variant->>'stockQuantity')::NUMERIC,0),COALESCE((v_variant->>'lowStockThreshold')::NUMERIC,5),COALESCE((v_variant->>'isActive')::BOOLEAN,true)) RETURNING id INTO v_variant_id;
    END IF;
    v_submitted_variant_ids := array_append(v_submitted_variant_ids,v_variant_id);
  END LOOP;

  PERFORM id FROM public.product_variants WHERE product_id=v_product_id AND NOT (id=ANY(v_submitted_variant_ids)) ORDER BY id FOR UPDATE;
  WITH archived AS (UPDATE public.product_variants AS variant SET is_active=false,updated_at=NOW() WHERE variant.product_id=v_product_id AND NOT (variant.id=ANY(v_submitted_variant_ids)) AND variant.is_active IS DISTINCT FROM false AND EXISTS (SELECT 1 FROM public.order_items item WHERE item.variant_id=variant.id) RETURNING variant.id) SELECT COALESCE(array_agg(id),ARRAY[]::UUID[]) INTO v_archived_variant_ids FROM archived;
  WITH deleted AS (DELETE FROM public.product_variants AS variant WHERE variant.product_id=v_product_id AND NOT (variant.id=ANY(v_submitted_variant_ids)) AND NOT EXISTS (SELECT 1 FROM public.order_items item WHERE item.variant_id=variant.id) RETURNING variant.id) SELECT COALESCE(array_agg(id),ARRAY[]::UUID[]) INTO v_deleted_variant_ids FROM deleted;
  IF EXISTS (SELECT 1 FROM public.products p JOIN public.product_variants v ON v.product_id=p.id WHERE p.id=v_product_id AND (COALESCE(p.promotional_price,p.price)+COALESCE(v.price_adjustment,0)<=0 OR COALESCE(p.promotional_price,p.price)+COALESCE(v.price_adjustment,0)='NaN'::NUMERIC)) THEN RAISE EXCEPTION 'O preco final da variacao deve ser maior que zero.' USING ERRCODE='23514'; END IF;
  DELETE FROM public.product_search_terms WHERE product_id=v_product_id;
  INSERT INTO public.product_search_terms(product_id,term) SELECT v_product_id,lower(btrim(value)) FROM jsonb_array_elements_text(COALESCE(p_payload->'searchTerms','[]'::jsonb)) WHERE length(btrim(value)) BETWEEN 1 AND 100 GROUP BY lower(btrim(value));
  INSERT INTO public.admin_audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES (p_user_id,CASE WHEN p_product_id IS NULL THEN 'product_created' ELSE 'product_updated' END,'products',v_product_id,v_old_product,jsonb_build_object('name',p_payload->>'name','barcode',p_payload->>'barcode','variants_count',jsonb_array_length(p_payload->'variants'),'archived_variant_ids',to_jsonb(v_archived_variant_ids),'deleted_variant_ids',to_jsonb(v_deleted_variant_ids)));
  RETURN v_product_id;
END; $$;

REVOKE ALL ON FUNCTION public.admin_save_product(UUID,JSONB,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_product(UUID,JSONB,UUID) TO authenticated;
COMMIT;
