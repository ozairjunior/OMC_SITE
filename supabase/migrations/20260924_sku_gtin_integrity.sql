BEGIN;
CREATE SEQUENCE IF NOT EXISTS public.product_sku_seq START 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique ON public.products(barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE UNIQUE INDEX IF NOT EXISTS variants_barcode_unique ON public.product_variants(barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON public.products(sku) WHERE sku IS NOT NULL AND sku <> '';
CREATE UNIQUE INDEX IF NOT EXISTS variants_sku_unique ON public.product_variants(sku) WHERE sku IS NOT NULL AND sku <> '';
CREATE OR REPLACE FUNCTION public.assign_product_sku() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NULLIF(btrim(NEW.sku), '') IS NULL THEN NEW.sku := 'OMC-' || lpad(nextval('public.product_sku_seq')::text, 6, '0'); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_assign_product_sku ON public.products;
CREATE TRIGGER trg_assign_product_sku BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.assign_product_sku();
CREATE OR REPLACE FUNCTION public.assign_variant_sku() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_product_sku TEXT; v_number INTEGER;
BEGIN
  IF NULLIF(btrim(NEW.sku), '') IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.product_id::text, 42));
    SELECT sku INTO v_product_sku FROM public.products WHERE id = NEW.product_id;
    SELECT count(*) + 1 INTO v_number FROM public.product_variants WHERE product_id = NEW.product_id;
    NEW.sku := COALESCE(v_product_sku, 'OMC-' || lpad(nextval('public.product_sku_seq')::text, 6, '0')) || '-' || lpad(v_number::text, 2, '0');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_assign_variant_sku ON public.product_variants;
CREATE TRIGGER trg_assign_variant_sku BEFORE INSERT ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.assign_variant_sku();
COMMIT;
