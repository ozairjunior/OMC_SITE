-- Completa SKU de variações, preço exato, GTIN global, custo atômico e slug único.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT barcode FROM (
      SELECT NULLIF(regexp_replace(COALESCE(barcode,''),'\D','','g'),'') AS barcode FROM public.products
      UNION ALL
      SELECT NULLIF(regexp_replace(COALESCE(barcode,''),'\D','','g'),'') AS barcode FROM public.product_variants
    ) catalog_codes
    WHERE barcode IS NOT NULL
    GROUP BY barcode HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem codigos de barras duplicados entre produtos e variacoes. Corrija-os antes de aplicar 20260928.' USING ERRCODE='23505';
  END IF;
END $$;

ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12,2);
UPDATE public.product_variants AS v
SET sale_price = COALESCE(p.promotional_price, p.price) + COALESCE(v.price_adjustment, 0)
FROM public.products AS p
WHERE p.id = v.product_id AND v.sale_price IS NULL;
ALTER TABLE public.product_variants ALTER COLUMN sale_price SET NOT NULL;
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS product_variants_sale_price_positive;
ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_sale_price_positive CHECK (sale_price > 0);

CREATE TABLE IF NOT EXISTS public.product_variant_sku_counters (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  last_value INTEGER NOT NULL CHECK (last_value >= 0)
);
ALTER TABLE public.product_variant_sku_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_variant_sku_counters FROM PUBLIC, anon, authenticated;
INSERT INTO public.product_variant_sku_counters(product_id, last_value)
SELECT p.id, COALESCE(MAX(CASE WHEN v.sku ~ '-[0-9]+$' THEN substring(v.sku FROM '([0-9]+)$')::INTEGER END), 0)
FROM public.products p LEFT JOIN public.product_variants v ON v.product_id = p.id
GROUP BY p.id
ON CONFLICT (product_id) DO UPDATE SET last_value = GREATEST(product_variant_sku_counters.last_value, EXCLUDED.last_value);

CREATE OR REPLACE FUNCTION public.assign_variant_sku() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_product_sku TEXT; v_number INTEGER;
BEGIN
  IF NULLIF(btrim(NEW.sku), '') IS NULL THEN
    SELECT sku INTO v_product_sku FROM public.products WHERE id = NEW.product_id;
    INSERT INTO public.product_variant_sku_counters(product_id, last_value) VALUES (NEW.product_id, 1)
    ON CONFLICT (product_id) DO UPDATE SET last_value = product_variant_sku_counters.last_value + 1
    RETURNING last_value INTO v_number;
    NEW.sku := COALESCE(v_product_sku, 'OMC-' || lpad(nextval('public.product_sku_seq')::text, 6, '0')) || '-' || lpad(v_number::text, 2, '0');
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_variant_sale_price() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_product_price NUMERIC;
BEGIN
  SELECT price INTO v_product_price FROM public.products WHERE id = NEW.product_id;
  NEW.sale_price := v_product_price + COALESCE(NEW.price_adjustment, 0);
  IF NEW.sale_price <= 0 THEN RAISE EXCEPTION 'O preco de venda deve ser maior que zero.' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_variant_sale_price ON public.product_variants;
CREATE TRIGGER trg_sync_variant_sale_price BEFORE INSERT OR UPDATE OF price_adjustment ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.sync_variant_sale_price();

CREATE OR REPLACE FUNCTION public.enforce_global_catalog_barcode() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_barcode TEXT;
BEGIN
  v_barcode := NULLIF(regexp_replace(COALESCE(NEW.barcode, ''), '\D', '', 'g'), '');
  NEW.barcode := v_barcode;
  IF v_barcode IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_barcode, 73));
  IF TG_TABLE_NAME = 'products' AND EXISTS (SELECT 1 FROM public.product_variants WHERE barcode = v_barcode) THEN
    RAISE EXCEPTION 'Codigo de barras ja utilizado por uma variacao.' USING ERRCODE = '23505', CONSTRAINT = 'catalog_barcode_global_unique';
  ELSIF TG_TABLE_NAME = 'product_variants' AND EXISTS (SELECT 1 FROM public.products WHERE barcode = v_barcode) THEN
    RAISE EXCEPTION 'Codigo de barras ja utilizado por um produto.' USING ERRCODE = '23505', CONSTRAINT = 'catalog_barcode_global_unique';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_products_global_barcode ON public.products;
CREATE TRIGGER trg_products_global_barcode BEFORE INSERT OR UPDATE OF barcode ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_global_catalog_barcode();
DROP TRIGGER IF EXISTS trg_variants_global_barcode ON public.product_variants;
CREATE TRIGGER trg_variants_global_barcode BEFORE INSERT OR UPDATE OF barcode ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.enforce_global_catalog_barcode();

DO $$
BEGIN
  IF to_regprocedure('public.admin_save_product_brand_price_core(uuid,jsonb,uuid)') IS NULL
     AND to_regprocedure('public.admin_save_product(uuid,jsonb,uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.admin_save_product(UUID, JSONB, UUID) RENAME TO admin_save_product_brand_price_core;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_save_product_brand_price_core(UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_product(p_product_id UUID, p_payload JSONB, p_user_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payload JSONB := p_payload; v_variants JSONB; v_product_id UUID;
  v_price NUMERIC := (p_payload->>'price')::NUMERIC;
  v_base_slug TEXT; v_slug TEXT; v_suffix INTEGER := 1;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso administrativo negado.'; END IF;
  IF p_product_id IS NULL THEN
    v_base_slug := p_payload->>'slug'; v_slug := v_base_slug;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_base_slug, 91));
    WHILE EXISTS (SELECT 1 FROM public.products WHERE slug = v_slug) LOOP v_suffix := v_suffix + 1; v_slug := v_base_slug || '-' || v_suffix::TEXT; END LOOP;
    v_payload := jsonb_set(v_payload, '{slug}', to_jsonb(v_slug));
  END IF;
  SELECT jsonb_agg(variant || jsonb_build_object('priceAdjustment', COALESCE((variant->>'salePrice')::NUMERIC, v_price) - v_price))
  INTO v_variants FROM jsonb_array_elements(COALESCE(p_payload->'variants','[]'::JSONB)) AS variant;
  v_payload := jsonb_set(v_payload, '{promotionalPrice}', 'null'::JSONB, true);
  v_payload := jsonb_set(v_payload, '{variants}', COALESCE(v_variants, '[]'::JSONB), true);
  v_product_id := public.admin_save_product_brand_price_core(p_product_id, v_payload, p_user_id);
  UPDATE public.products SET promotional_price = NULL WHERE id = v_product_id;
  IF p_payload ? 'purchasePrice' AND p_payload->>'purchasePrice' IS NOT NULL THEN
    PERFORM public.admin_update_product_cost(v_product_id, (p_payload->>'purchasePrice')::NUMERIC, p_user_id);
  END IF;
  RETURN v_product_id;
END; $$;
REVOKE ALL ON FUNCTION public.admin_save_product(UUID, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_product(UUID, JSONB, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_product_cost(p_product_id UUID, p_purchase_price NUMERIC, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old NUMERIC; v_cost public.product_costs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso administrativo negado.'; END IF;
  IF p_purchase_price < 0 THEN RAISE EXCEPTION 'Preco de compra invalido.' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id FOR UPDATE) THEN RAISE EXCEPTION 'Produto nao encontrado.' USING ERRCODE = 'P0002'; END IF;
  SELECT purchase_price INTO v_old FROM public.product_costs WHERE product_id = p_product_id FOR UPDATE;
  INSERT INTO public.product_costs(product_id,purchase_price,updated_by,updated_at) VALUES (p_product_id,p_purchase_price,p_user_id,NOW())
  ON CONFLICT (product_id) DO UPDATE SET purchase_price=EXCLUDED.purchase_price,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at RETURNING * INTO v_cost;
  IF v_old IS DISTINCT FROM p_purchase_price THEN INSERT INTO public.admin_audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES (p_user_id,'purchase_price_changed','product_cost',v_cost.id,jsonb_build_object('purchase_price',v_old),jsonb_build_object('purchase_price',p_purchase_price,'product_id',p_product_id)); END IF;
  RETURN to_jsonb(v_cost);
END; $$;
REVOKE ALL ON FUNCTION public.admin_update_product_cost(UUID, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_product_cost(UUID, NUMERIC, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.slugify_catalog_value(p_value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT trim(both '-' FROM regexp_replace(
    lower(translate(p_value,
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
    '[^a-z0-9]+', '-', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.admin_create_category(p_name TEXT, p_display_order INTEGER, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.categories%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso administrativo negado.'; END IF;
  INSERT INTO public.categories(name,slug,display_order,is_active) VALUES (btrim(p_name),public.slugify_catalog_value(p_name),p_display_order,true) RETURNING * INTO v_row;
  INSERT INTO public.admin_audit_logs(user_id,action,entity_type,entity_id,new_data) VALUES (p_user_id,'category_created','category',v_row.id,to_jsonb(v_row));
  RETURN to_jsonb(v_row);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_category(p_category_id UUID, p_payload JSONB, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.categories%ROWTYPE; v_new public.categories%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso administrativo negado.'; END IF;
  SELECT * INTO v_old FROM public.categories WHERE id=p_category_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoria nao encontrada.' USING ERRCODE='P0002'; END IF;
  UPDATE public.categories SET name=COALESCE(NULLIF(btrim(p_payload->>'name'),''),name),slug=CASE WHEN NULLIF(btrim(p_payload->>'name'),'') IS NULL THEN slug ELSE public.slugify_catalog_value(p_payload->>'name') END,display_order=COALESCE((p_payload->>'displayOrder')::INTEGER,display_order),is_active=COALESCE((p_payload->>'isActive')::BOOLEAN,is_active),updated_at=NOW() WHERE id=p_category_id RETURNING * INTO v_new;
  INSERT INTO public.admin_audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES (p_user_id,CASE WHEN v_old.is_active AND NOT v_new.is_active THEN 'category_archived' ELSE 'category_updated' END,'category',p_category_id,to_jsonb(v_old),to_jsonb(v_new));
  RETURN to_jsonb(v_new);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_brand(p_name TEXT, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.brands%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso administrativo negado.'; END IF;
  INSERT INTO public.brands(name,slug,is_active) VALUES (btrim(p_name),public.slugify_catalog_value(p_name),true) RETURNING * INTO v_row;
  INSERT INTO public.admin_audit_logs(user_id,action,entity_type,entity_id,new_data) VALUES (p_user_id,'brand_created','brand',v_row.id,to_jsonb(v_row));
  RETURN to_jsonb(v_row);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_brand(p_brand_id UUID, p_payload JSONB, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.brands%ROWTYPE; v_new public.brands%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id OR NOT public.has_role(ARRAY['admin','manager']::public.user_role[]) THEN RAISE EXCEPTION 'Acesso administrativo negado.'; END IF;
  SELECT * INTO v_old FROM public.brands WHERE id=p_brand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marca nao encontrada.' USING ERRCODE='P0002'; END IF;
  UPDATE public.brands SET name=COALESCE(NULLIF(btrim(p_payload->>'name'),''),name),slug=CASE WHEN NULLIF(btrim(p_payload->>'name'),'') IS NULL THEN slug ELSE public.slugify_catalog_value(p_payload->>'name') END,is_active=COALESCE((p_payload->>'isActive')::BOOLEAN,is_active),updated_at=NOW() WHERE id=p_brand_id RETURNING * INTO v_new;
  INSERT INTO public.admin_audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES (p_user_id,CASE WHEN v_old.is_active AND NOT v_new.is_active THEN 'brand_archived' ELSE 'brand_updated' END,'brand',p_brand_id,to_jsonb(v_old),to_jsonb(v_new));
  RETURN to_jsonb(v_new);
END; $$;

REVOKE ALL ON FUNCTION public.admin_create_category(TEXT,INTEGER,UUID), public.admin_update_category(UUID,JSONB,UUID), public.admin_create_brand(TEXT,UUID), public.admin_update_brand(UUID,JSONB,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_category(TEXT,INTEGER,UUID), public.admin_update_category(UUID,JSONB,UUID), public.admin_create_brand(TEXT,UUID), public.admin_update_brand(UUID,JSONB,UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
