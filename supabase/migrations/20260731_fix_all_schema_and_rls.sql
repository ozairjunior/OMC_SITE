-- ============================================================================
-- SCRIPT DE MIGRACAO SEGURO: RLS COMPLETA, RPC E TRIGGER DE ESTOQUE
-- ============================================================================

-- 1. Função Helper para Validação de Papel
CREATE OR REPLACE FUNCTION public.has_role(allowed_roles public.user_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role = ANY(allowed_roles)
  );
$$;

-- 2. Limpeza de TODAS as políticas antigas para evitar conflitos OR do PostgreSQL
DROP POLICY IF EXISTS "Public Read Categories" ON public.categories;
DROP POLICY IF EXISTS "Admin Manage Categories" ON public.categories;
DROP POLICY IF EXISTS "Public Read Products" ON public.products;
DROP POLICY IF EXISTS "Admin Manage Products" ON public.products;
DROP POLICY IF EXISTS "Public Read Variants" ON public.product_variants;
DROP POLICY IF EXISTS "Admin Manage Variants" ON public.product_variants;
DROP POLICY IF EXISTS "Public Read Images" ON public.product_images;
DROP POLICY IF EXISTS "Admin Manage Images" ON public.product_images;
DROP POLICY IF EXISTS "Staff Read Orders" ON public.orders;
DROP POLICY IF EXISTS "Staff Update Orders" ON public.orders;
DROP POLICY IF EXISTS "Staff Read Order Items" ON public.order_items;
DROP POLICY IF EXISTS "User Read Own Profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin Manage Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public Insert Analytics" ON public.analytics_events;
DROP POLICY IF EXISTS "Staff Read Analytics" ON public.analytics_events;

-- 3. Novas Políticas RLS Estritas
-- Categorias
CREATE POLICY "Public Read Categories" ON public.categories FOR SELECT TO PUBLIC USING (is_active = true OR public.has_role(ARRAY['admin', 'manager']::public.user_role[]));
CREATE POLICY "Admin Manage Categories" ON public.categories FOR ALL TO authenticated USING (public.has_role(ARRAY['admin', 'manager']::public.user_role[])) WITH CHECK (public.has_role(ARRAY['admin', 'manager']::public.user_role[]));

-- Produtos
CREATE POLICY "Public Read Products" ON public.products FOR SELECT TO PUBLIC USING (is_active = true OR public.has_role(ARRAY['admin', 'manager']::public.user_role[]));
CREATE POLICY "Admin Manage Products" ON public.products FOR ALL TO authenticated USING (public.has_role(ARRAY['admin', 'manager']::public.user_role[])) WITH CHECK (public.has_role(ARRAY['admin', 'manager']::public.user_role[]));

-- Variações
CREATE POLICY "Public Read Variants" ON public.product_variants FOR SELECT TO PUBLIC USING (is_active = true OR public.has_role(ARRAY['admin', 'manager']::public.user_role[]));
CREATE POLICY "Admin Manage Variants" ON public.product_variants FOR ALL TO authenticated USING (public.has_role(ARRAY['admin', 'manager']::public.user_role[])) WITH CHECK (public.has_role(ARRAY['admin', 'manager']::public.user_role[]));

-- Imagens
CREATE POLICY "Public Read Images" ON public.product_images FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Admin Manage Images" ON public.product_images FOR ALL TO authenticated USING (public.has_role(ARRAY['admin', 'manager']::public.user_role[])) WITH CHECK (public.has_role(ARRAY['admin', 'manager']::public.user_role[]));

-- Pedidos e Itens (Sem inserção pública direta; inserção feita via RPC SECURITY DEFINER)
CREATE POLICY "Staff Read Orders" ON public.orders FOR SELECT TO authenticated USING (public.has_role(ARRAY['admin', 'manager', 'attendant', 'viewer']::public.user_role[]));
CREATE POLICY "Staff Update Orders" ON public.orders FOR UPDATE TO authenticated USING (public.has_role(ARRAY['admin', 'manager', 'attendant']::public.user_role[]));

CREATE POLICY "Staff Read Order Items" ON public.order_items FOR SELECT TO authenticated USING (public.has_role(ARRAY['admin', 'manager', 'attendant', 'viewer']::public.user_role[]));

-- Profiles
CREATE POLICY "User Read Own Profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(ARRAY['admin']::public.user_role[]));
CREATE POLICY "Admin Manage Profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(ARRAY['admin']::public.user_role[]));

-- Analytics
-- Eventos publicos sao registrados apenas por uma API server-side confiavel.
CREATE POLICY "Staff Read Analytics" ON public.analytics_events FOR SELECT TO authenticated USING (public.has_role(ARRAY['admin', 'manager', 'viewer']::public.user_role[]));

-- 4. Função Transacional RPC para Criar Pedido com Validação de Endereço e Passo de Quantidade
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
  p_items JSONB
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
  v_variant RECORD;
  v_product RECORD;
  v_item_quantity NUMERIC(10,2);
  v_item_unit_price NUMERIC(12,2);
  v_item_total NUMERIC(12,2);
  v_response_items JSONB := '[]'::jsonb;
  v_step_check NUMERIC(12,4);
BEGIN
  -- Validar quantidade de itens no payload
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'O pedido deve conter pelo menos um item.';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'O pedido excede o limite máximo de 50 itens.';
  END IF;

  -- Gerar Código de Pedido Sequencial
  v_public_code := 'OMC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('public.order_code_seq')::TEXT, 6, '0');

  -- Criar o Pedido Mestre com Subtotal Zerado Temporariamente
  INSERT INTO public.orders (
    public_code,
    customer_name,
    customer_phone,
    address,
    address_number,
    neighborhood,
    city,
    complement,
    reference_point,
    postal_code,
    notes,
    subtotal,
    total,
    status
  ) VALUES (
    v_public_code,
    p_customer_name,
    p_customer_phone,
    p_address,
    p_address_number,
    p_neighborhood,
    p_city,
    p_complement,
    p_reference_point,
    p_postal_code,
    p_notes,
    0.00,
    0.00,
    'request_created'
  ) RETURNING id INTO v_order_id;

  -- Iterar e Validar Itens
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(variant_id UUID, quantity NUMERIC)
  LOOP
    v_item_quantity := v_item.quantity;

    IF v_item_quantity IS NULL OR v_item_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida enviada para a variação %', v_item.variant_id;
    END IF;

    -- Obter Variação do Produto
    SELECT * INTO v_variant FROM public.product_variants WHERE id = v_item.variant_id AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variação não encontrada ou inativa: %', v_item.variant_id;
    END IF;

    -- Obter Produto Pai
    SELECT * INTO v_product FROM public.products WHERE id = v_variant.product_id AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado ou inativo: %', v_variant.product_id;
    END IF;

    -- Validação de Estoque
    IF v_variant.stock_quantity < v_item_quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%". Disponível: %, Solicitado: %', v_product.name, v_variant.stock_quantity, v_item_quantity;
    END IF;

    -- Validação de Quantidade Mínima
    IF v_item_quantity < v_product.minimum_quantity THEN
      RAISE EXCEPTION 'A quantidade mínima para "%" é %', v_product.name, v_product.minimum_quantity;
    END IF;

    -- Validação de Passo (Step)
    v_step_check := MOD((v_item_quantity - v_product.minimum_quantity) * 100, v_product.step_quantity * 100);
    IF v_step_check <> 0 THEN
      RAISE EXCEPTION 'A quantidade para "%" deve seguir o incremento de % em %', v_product.name, v_product.step_quantity, v_product.step_quantity;
    END IF;

    -- Cálculo de Preço do Servidor
    v_item_unit_price := COALESCE(v_product.promotional_price, v_product.price) + COALESCE(v_variant.price_adjustment, 0);
    v_item_total := ROUND((v_item_unit_price * v_item_quantity)::numeric, 2);
    v_calculated_subtotal := v_calculated_subtotal + v_item_total;

    -- Inserção do Snapshot do Item
    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      product_name_snapshot,
      variant_name_snapshot,
      sku_snapshot,
      unit_snapshot,
      unit_price,
      quantity,
      total_price
    ) VALUES (
      v_order_id,
      v_product.id,
      v_variant.id,
      v_product.name,
      v_variant.name,
      COALESCE(v_variant.sku, v_product.sku, 'N/A'),
      v_product.unit,
      v_item_unit_price,
      v_item_quantity,
      v_item_total
    );

    v_response_items := v_response_items || jsonb_build_object(
      'name', v_product.name,
      'variantName', v_variant.name,
      'unit', v_product.unit,
      'quantity', v_item_quantity,
      'unitPrice', v_item_unit_price,
      'totalPrice', v_item_total
    );
  END LOOP;

  -- Atualizar Totais do Pedido
  UPDATE public.orders 
  SET subtotal = v_calculated_subtotal, total = v_calculated_subtotal 
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'publicCode', v_public_code,
    'total', v_calculated_subtotal,
    'items', v_response_items
  );
END;
$$;

-- Permissões explícitas da RPC
REVOKE ALL ON FUNCTION public.create_catalog_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_catalog_order TO service_role;

-- 5. Trigger de Abate de Estoque APENAS na Confirmação
CREATE OR REPLACE FUNCTION public.handle_order_confirmation()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' THEN
    FOR v_item IN SELECT variant_id, quantity FROM public.order_items WHERE order_id = NEW.id LOOP
      UPDATE public.product_variants
      SET stock_quantity = stock_quantity - v_item.quantity
      WHERE id = v_item.variant_id;
    END LOOP;
    NEW.confirmed_at := NOW();
  END IF;
  
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    NEW.completed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_confirmation ON public.orders;
CREATE TRIGGER trg_order_confirmation
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_confirmation();

-- Views Analíticas
CREATE OR REPLACE VIEW public.view_sales_funnel_summary AS
SELECT
  status,
  COUNT(*) AS total_orders,
  COALESCE(SUM(total), 0) AS aggregate_value
FROM public.orders
GROUP BY status;

CREATE OR REPLACE VIEW public.view_top_requested_products AS
SELECT
  oi.product_name_snapshot AS product_name,
  oi.unit_snapshot AS unit,
  SUM(oi.quantity) AS total_quantity,
  SUM(oi.total_price) AS total_revenue,
  COUNT(DISTINCT oi.order_id) AS total_orders_appeared
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE o.status NOT IN ('cancelled')
GROUP BY oi.product_name_snapshot, oi.unit_snapshot
ORDER BY total_revenue DESC
LIMIT 10;
