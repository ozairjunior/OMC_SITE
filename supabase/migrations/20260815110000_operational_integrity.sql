-- Integridade operacional do catalogo, pedidos e painel administrativo.
-- Esta migration e idempotente e atende bancos existentes e instalacoes novas.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.product_search_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  term TEXT NOT NULL CHECK (length(btrim(term)) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, term)
);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.product_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin Manage Search Terms" ON public.product_search_terms;
CREATE POLICY "Admin Manage Search Terms"
  ON public.product_search_terms FOR ALL TO authenticated
  USING (public.has_role(ARRAY['admin', 'manager']::public.user_role[]))
  WITH CHECK (public.has_role(ARRAY['admin', 'manager']::public.user_role[]));

DROP POLICY IF EXISTS "Admin Read Audit Logs" ON public.admin_audit_logs;
CREATE POLICY "Admin Read Audit Logs"
  ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(ARRAY['admin', 'manager']::public.user_role[]));

DROP POLICY IF EXISTS "Admin Insert Audit Logs" ON public.admin_audit_logs;
CREATE POLICY "Admin Insert Audit Logs"
  ON public.admin_audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_role(ARRAY['admin', 'manager']::public.user_role[])
  );

CREATE INDEX IF NOT EXISTS idx_search_terms_product_id
  ON public.product_search_terms(product_id);
CREATE INDEX IF NOT EXISTS idx_search_terms_term_trgm
  ON public.product_search_terms USING gin (term gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_admin_audit_entity
  ON public.admin_audit_logs(entity_type, entity_id, created_at DESC);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS public_tracking_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS stock_committed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_rate_limit
  ON public.orders(request_fingerprint, created_at DESC)
  WHERE request_fingerprint IS NOT NULL;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_quantity_rules;
ALTER TABLE public.products
  ADD CONSTRAINT products_quantity_rules
  CHECK (
    price > 0
    AND minimum_quantity > 0
    AND step_quantity > 0
    AND (promotional_price IS NULL OR promotional_price > 0)
  ) NOT VALID;

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_stock_rules;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_stock_rules
  CHECK (stock_quantity >= 0 AND low_stock_threshold >= 0) NOT VALID;

-- Mantem no maximo uma imagem principal por produto antes de criar o indice.
WITH duplicated_primary AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY created_at, id) AS position
  FROM public.product_images
  WHERE is_primary = true
)
UPDATE public.product_images AS images
SET is_primary = false
FROM duplicated_primary
WHERE images.id = duplicated_primary.id
  AND duplicated_primary.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_one_primary
  ON public.product_images(product_id)
  WHERE is_primary = true;

-- Eventos publicos passam pelas APIs server-side, nunca por insert anonimo direto.
DROP POLICY IF EXISTS "Public Insert Analytics" ON public.analytics_events;
-- Alteracoes de status passam exclusivamente pela RPC transacional abaixo.
DROP POLICY IF EXISTS "Staff Update Orders" ON public.orders;

-- A RPC publica antiga e removida. Somente a API server-side, usando service_role,
-- pode criar pedidos e aplicar o rate limit persistente.
DROP FUNCTION IF EXISTS public.create_catalog_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
);

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

CREATE OR REPLACE FUNCTION public.mark_order_whatsapp_clicked(
  p_order_id UUID,
  p_tracking_token TEXT,
  p_session_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id UUID;
BEGIN
  UPDATE public.orders
  SET status = CASE
        WHEN status IN ('request_created', 'checkout_started') THEN 'whatsapp_clicked'::public.order_status
        ELSE status
      END,
      whatsapp_clicked_at = COALESCE(whatsapp_clicked_at, NOW()),
      updated_at = NOW()
  WHERE id = p_order_id
    AND public_tracking_token_hash = encode(digest(p_tracking_token, 'sha256'), 'hex')
    AND status IN ('request_created', 'checkout_started', 'whatsapp_clicked')
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.analytics_events
    WHERE order_id = p_order_id AND event_name = 'whatsapp_clicked'
  ) THEN
    INSERT INTO public.analytics_events(session_id, event_name, order_id)
    VALUES (left(COALESCE(NULLIF(p_session_id, ''), 'checkout'), 100), 'whatsapp_clicked', p_order_id);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_whatsapp_clicked(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_whatsapp_clicked(UUID, TEXT, TEXT)
  TO service_role;

-- Estoque e abatido uma unica vez; cancelamento devolve o que foi comprometido.
CREATE OR REPLACE FUNCTION public.handle_order_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF NEW.status = 'confirmed' AND OLD.stock_committed_at IS NULL THEN
    FOR v_item IN
      SELECT variant_id, quantity FROM public.order_items WHERE order_id = NEW.id
    LOOP
      IF v_item.variant_id IS NULL THEN
        RAISE EXCEPTION 'Pedido possui item sem variacao ativa para controle de estoque.';
      END IF;
      UPDATE public.product_variants
      SET stock_quantity = stock_quantity - v_item.quantity
      WHERE id = v_item.variant_id AND stock_quantity >= v_item.quantity;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Estoque insuficiente ao confirmar o pedido.';
      END IF;
    END LOOP;
    NEW.stock_committed_at := NOW();
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, NOW());
  END IF;

  IF NEW.status = 'cancelled' AND OLD.stock_committed_at IS NOT NULL
    AND OLD.status <> 'completed' THEN
    FOR v_item IN
      SELECT variant_id, quantity FROM public.order_items WHERE order_id = NEW.id
    LOOP
      IF v_item.variant_id IS NOT NULL THEN
        UPDATE public.product_variants
        SET stock_quantity = stock_quantity + v_item.quantity
        WHERE id = v_item.variant_id;
      END IF;
    END LOOP;
    NEW.stock_committed_at := NULL;
  END IF;

  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    NEW.completed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_confirmation ON public.orders;
CREATE TRIGGER trg_order_confirmation
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_confirmation();

CREATE OR REPLACE FUNCTION public.admin_transition_order_status(
  p_order_id UUID,
  p_new_status public.order_status,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_allowed BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id
    OR NOT public.has_role(ARRAY['admin', 'manager']::public.user_role[]) THEN
    RAISE EXCEPTION 'Acesso administrativo negado.';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido nao encontrado.'; END IF;
  IF v_order.status = p_new_status THEN
    RETURN jsonb_build_object('status', v_order.status);
  END IF;

  v_allowed := CASE v_order.status
    WHEN 'cart_created' THEN p_new_status IN ('checkout_started', 'cancelled')
    WHEN 'checkout_started' THEN p_new_status IN ('request_created', 'whatsapp_clicked', 'cancelled')
    WHEN 'request_created' THEN p_new_status IN ('whatsapp_clicked', 'contacted', 'quoted', 'confirmed', 'cancelled')
    WHEN 'whatsapp_clicked' THEN p_new_status IN ('contacted', 'quoted', 'confirmed', 'cancelled')
    WHEN 'contacted' THEN p_new_status IN ('quoted', 'confirmed', 'cancelled')
    WHEN 'quoted' THEN p_new_status IN ('contacted', 'confirmed', 'cancelled')
    WHEN 'confirmed' THEN p_new_status IN ('completed', 'cancelled')
    ELSE false
  END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Transicao de status nao permitida.'; END IF;

  UPDATE public.orders SET status = p_new_status, updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.admin_audit_logs(
    user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_user_id, 'order_status_changed', 'orders', p_order_id,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', p_new_status)
  );
  RETURN jsonb_build_object('status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_transition_order_status(UUID, public.order_status, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_transition_order_status(UUID, public.order_status, UUID) TO authenticated;

-- Produto e variacoes sao salvos na mesma transacao PostgreSQL.
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

CREATE OR REPLACE FUNCTION public.admin_archive_product(p_product_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_name TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id
    OR NOT public.has_role(ARRAY['admin', 'manager']::public.user_role[]) THEN
    RAISE EXCEPTION 'Acesso administrativo negado.';
  END IF;
  UPDATE public.products SET is_active = false, updated_at = NOW()
  WHERE id = p_product_id RETURNING name INTO v_name;
  IF v_name IS NULL THEN RETURN false; END IF;
  UPDATE public.product_variants SET is_active = false, updated_at = NOW()
  WHERE product_id = p_product_id;
  INSERT INTO public.admin_audit_logs(user_id, action, entity_type, entity_id, old_data)
  VALUES (p_user_id, 'product_archived', 'products', p_product_id, jsonb_build_object('name', v_name));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_archive_product(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_archive_product(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_primary_product_image(
  p_product_id UUID, p_image_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(ARRAY['admin', 'manager']::public.user_role[]) THEN
    RAISE EXCEPTION 'Acesso administrativo negado.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.product_images WHERE id = p_image_id AND product_id = p_product_id
  ) THEN RETURN false; END IF;
  UPDATE public.product_images SET is_primary = false WHERE product_id = p_product_id;
  UPDATE public.product_images SET is_primary = true WHERE id = p_image_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_primary_product_image(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_primary_product_image(UUID, UUID) TO authenticated;
