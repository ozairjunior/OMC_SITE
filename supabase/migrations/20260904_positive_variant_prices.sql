-- Impede precos finais invalidos nas RPCs, inclusive dados legados no checkout.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_catalog_order(
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_address TEXT,
  p_address_number TEXT,
  p_neighborhood TEXT,
  p_city TEXT,
  p_complement TEXT,
  p_reference_point TEXT,
  p_postal_code TEXT,
  p_notes TEXT,
  p_items JSONB,
  p_request_fingerprint TEXT,
  p_tracking_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_public_code TEXT;
  v_calculated_subtotal NUMERIC(12,2) := 0;
  v_item RECORD;
  v_variant public.product_variants%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_item_unit_price NUMERIC(12,2);
  v_item_total NUMERIC(12,2);
  v_response_items JSONB := '[]'::jsonb;
BEGIN
  IF length(btrim(p_customer_name)) NOT BETWEEN 3 AND 150
    OR length(btrim(p_customer_phone)) NOT BETWEEN 10 AND 30
    OR length(btrim(p_address)) NOT BETWEEN 3 AND 200
    OR length(btrim(p_address_number)) NOT BETWEEN 1 AND 20
    OR length(btrim(p_neighborhood)) NOT BETWEEN 2 AND 100
    OR length(btrim(p_city)) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Dados do cliente ou endereco fora dos limites permitidos.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'O pedido deve conter entre 1 e 50 itens.';
  END IF;

  IF p_request_fingerprint IS NULL OR length(p_request_fingerprint) <> 64
    OR p_tracking_token IS NULL OR length(p_tracking_token) < 32 THEN
    RAISE EXCEPTION 'Metadados de seguranca invalidos.';
  END IF;

  IF (
    SELECT COUNT(*) FROM public.orders
    WHERE request_fingerprint = p_request_fingerprint
      AND created_at >= NOW() - INTERVAL '10 minutes'
  ) >= 8 THEN
    RAISE EXCEPTION 'Limite temporario de solicitacoes atingido. Aguarde alguns minutos.';
  END IF;

  v_public_code := 'OMC-' || TO_CHAR(NOW(), 'YYYY') || '-'
    || LPAD(NEXTVAL('public.order_code_seq')::TEXT, 6, '0');

  INSERT INTO public.orders (
    public_code, customer_name, customer_phone, address, address_number,
    neighborhood, city, complement, reference_point, postal_code, notes,
    subtotal, total, status, request_fingerprint, public_tracking_token_hash
  ) VALUES (
    v_public_code, btrim(p_customer_name), btrim(p_customer_phone), btrim(p_address),
    btrim(p_address_number), btrim(p_neighborhood), btrim(p_city),
    NULLIF(btrim(p_complement), ''), NULLIF(btrim(p_reference_point), ''),
    NULLIF(btrim(p_postal_code), ''), NULLIF(btrim(p_notes), ''), 0, 0,
    'request_created', p_request_fingerprint,
    encode(digest(p_tracking_token, 'sha256'), 'hex')
  ) RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT variant_id, SUM(quantity)::NUMERIC(10,2) AS quantity
    FROM jsonb_to_recordset(p_items) AS item(variant_id UUID, quantity NUMERIC)
    GROUP BY variant_id
  LOOP
    IF v_item.variant_id IS NULL OR v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Item ou quantidade invalida.';
    END IF;

    SELECT * INTO v_variant
    FROM public.product_variants
    WHERE id = v_item.variant_id AND is_active = true
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variacao indisponivel.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_variant.product_id AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto indisponivel.';
    END IF;

    IF v_variant.stock_quantity < v_item.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%".', v_product.name;
    END IF;
    IF v_item.quantity < v_product.minimum_quantity THEN
      RAISE EXCEPTION 'Quantidade abaixo do minimo para "%".', v_product.name;
    END IF;
    IF MOD(v_item.quantity - v_product.minimum_quantity, v_product.step_quantity) <> 0 THEN
      RAISE EXCEPTION 'Quantidade fora do incremento permitido para "%".', v_product.name;
    END IF;

    v_item_unit_price := COALESCE(v_product.promotional_price, v_product.price)
      + COALESCE(v_variant.price_adjustment, 0);
    IF v_item_unit_price IS NULL OR v_item_unit_price <= 0
      OR v_item_unit_price = 'NaN'::NUMERIC THEN
      RAISE EXCEPTION 'O preco final da variacao deve ser maior que zero.'
        USING ERRCODE = '23514';
    END IF;
    v_item_total := ROUND(v_item_unit_price * v_item.quantity, 2);
    v_calculated_subtotal := v_calculated_subtotal + v_item_total;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name_snapshot,
      variant_name_snapshot, sku_snapshot, unit_snapshot, unit_price,
      quantity, total_price
    ) VALUES (
      v_order_id, v_product.id, v_variant.id, v_product.name, v_variant.name,
      COALESCE(v_variant.sku, v_product.sku, 'N/A'), v_product.unit,
      v_item_unit_price, v_item.quantity, v_item_total
    );

    v_response_items := v_response_items || jsonb_build_object(
      'name', v_product.name, 'variantName', v_variant.name,
      'unit', v_product.unit, 'quantity', v_item.quantity,
      'unitPrice', v_item_unit_price, 'totalPrice', v_item_total
    );
  END LOOP;

  UPDATE public.orders
  SET subtotal = v_calculated_subtotal, total = v_calculated_subtotal
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'orderId', v_order_id, 'publicCode', v_public_code,
    'total', v_calculated_subtotal, 'items', v_response_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_catalog_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  JSONB, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalog_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  JSONB, TEXT, TEXT
) TO service_role;

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
  v_variant JSONB;
  v_variant_id UUID;
  v_submitted_variant_ids UUID[] := ARRAY[]::UUID[];
  v_old_product JSONB;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id
    OR NOT public.has_role(ARRAY['admin', 'manager']::public.user_role[]) THEN
    RAISE EXCEPTION 'Acesso administrativo negado.';
  END IF;
  IF jsonb_array_length(COALESCE(p_payload->'variants', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'O produto deve possuir ao menos uma variacao.';
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO public.products(
      category_id, name, slug, sku, short_description, description, brand,
      unit, price, promotional_price, minimum_quantity, step_quantity,
      coverage_per_package, featured, is_active
    ) VALUES (
      (p_payload->>'categoryId')::UUID, p_payload->>'name', p_payload->>'slug',
      NULLIF(p_payload->>'sku', ''), NULLIF(p_payload->>'shortDescription', ''),
      NULLIF(p_payload->>'description', ''), NULLIF(p_payload->>'brand', ''),
      p_payload->>'unit', (p_payload->>'price')::NUMERIC,
      (p_payload->>'promotionalPrice')::NUMERIC,
      (p_payload->>'minimumQuantity')::NUMERIC,
      (p_payload->>'stepQuantity')::NUMERIC,
      (p_payload->>'coveragePerPackage')::NUMERIC,
      COALESCE((p_payload->>'featured')::BOOLEAN, false),
      COALESCE((p_payload->>'isActive')::BOOLEAN, true)
    ) RETURNING id INTO v_product_id;
  ELSE
    SELECT to_jsonb(products) INTO v_old_product
    FROM public.products WHERE id = p_product_id FOR UPDATE;
    IF v_old_product IS NULL THEN RAISE EXCEPTION 'Produto nao encontrado.'; END IF;
    v_product_id := p_product_id;

    UPDATE public.products SET
      category_id = (p_payload->>'categoryId')::UUID,
      name = p_payload->>'name', slug = p_payload->>'slug',
      sku = NULLIF(p_payload->>'sku', ''),
      short_description = NULLIF(p_payload->>'shortDescription', ''),
      description = NULLIF(p_payload->>'description', ''),
      brand = NULLIF(p_payload->>'brand', ''), unit = p_payload->>'unit',
      price = (p_payload->>'price')::NUMERIC,
      promotional_price = (p_payload->>'promotionalPrice')::NUMERIC,
      minimum_quantity = (p_payload->>'minimumQuantity')::NUMERIC,
      step_quantity = (p_payload->>'stepQuantity')::NUMERIC,
      coverage_per_package = (p_payload->>'coveragePerPackage')::NUMERIC,
      featured = COALESCE((p_payload->>'featured')::BOOLEAN, false),
      is_active = COALESCE((p_payload->>'isActive')::BOOLEAN, true),
      updated_at = NOW()
    WHERE id = v_product_id;
  END IF;

  FOR v_variant IN SELECT value FROM jsonb_array_elements(p_payload->'variants')
  LOOP
    v_variant_id := NULLIF(v_variant->>'id', '')::UUID;
    IF v_variant_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.product_variants
        WHERE id = v_variant_id AND product_id = v_product_id
      ) THEN RAISE EXCEPTION 'Variacao nao pertence ao produto.'; END IF;

      UPDATE public.product_variants SET
        name = v_variant->>'name', sku = NULLIF(v_variant->>'sku', ''),
        color = NULLIF(v_variant->>'color', ''), size = NULLIF(v_variant->>'size', ''),
        length = NULLIF(v_variant->>'length', ''),
        price_adjustment = COALESCE((v_variant->>'priceAdjustment')::NUMERIC, 0),
        stock_quantity = COALESCE((v_variant->>'stockQuantity')::NUMERIC, 0),
        low_stock_threshold = COALESCE((v_variant->>'lowStockThreshold')::NUMERIC, 5),
        is_active = COALESCE((v_variant->>'isActive')::BOOLEAN, true), updated_at = NOW()
      WHERE id = v_variant_id;
    ELSE
      INSERT INTO public.product_variants(
        product_id, name, sku, color, size, length, price_adjustment,
        stock_quantity, low_stock_threshold, is_active
      ) VALUES (
        v_product_id, v_variant->>'name', NULLIF(v_variant->>'sku', ''),
        NULLIF(v_variant->>'color', ''), NULLIF(v_variant->>'size', ''),
        NULLIF(v_variant->>'length', ''),
        COALESCE((v_variant->>'priceAdjustment')::NUMERIC, 0),
        COALESCE((v_variant->>'stockQuantity')::NUMERIC, 0),
        COALESCE((v_variant->>'lowStockThreshold')::NUMERIC, 5),
        COALESCE((v_variant->>'isActive')::BOOLEAN, true)
      ) RETURNING id INTO v_variant_id;
    END IF;
    v_submitted_variant_ids := array_append(v_submitted_variant_ids, v_variant_id);
  END LOOP;

  DELETE FROM public.product_variants
  WHERE product_id = v_product_id AND NOT (id = ANY(v_submitted_variant_ids));

  -- Confere todas as variacoes persistidas, inclusive inativas e valores
  -- arredondados para centavos. Uma falha desfaz toda a transacao.
  IF EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.product_variants v ON v.product_id = p.id
    WHERE p.id = v_product_id
      AND (COALESCE(p.promotional_price, p.price) + COALESCE(v.price_adjustment, 0) <= 0
        OR COALESCE(p.promotional_price, p.price) + COALESCE(v.price_adjustment, 0) = 'NaN'::NUMERIC)
  ) THEN
    RAISE EXCEPTION 'O preco final da variacao deve ser maior que zero.'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.product_search_terms WHERE product_id = v_product_id;
  INSERT INTO public.product_search_terms(product_id, term)
  SELECT v_product_id, lower(btrim(value))
  FROM jsonb_array_elements_text(COALESCE(p_payload->'searchTerms', '[]'::jsonb))
  WHERE length(btrim(value)) BETWEEN 1 AND 100
  GROUP BY lower(btrim(value));

  INSERT INTO public.admin_audit_logs(
    user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_user_id,
    CASE WHEN p_product_id IS NULL THEN 'product_created' ELSE 'product_updated' END,
    'products', v_product_id, v_old_product,
    jsonb_build_object('name', p_payload->>'name', 'variants_count', jsonb_array_length(p_payload->'variants'))
  );
  RETURN v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_product(UUID, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_product(UUID, JSONB, UUID) TO authenticated;


COMMIT;
