-- Schema estrutural V1. Banco novo e vazio. Sem dados, reset ou usuário específico.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $$ BEGIN CREATE TYPE public.user_role AS ENUM ('admin','manager','attendant','viewer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.order_status AS ENUM ('request_created','whatsapp_link_shown','whatsapp_clicked','contacted','quoted','confirmed','cancelled','completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SEQUENCE public.order_code_seq START 1000;
CREATE SEQUENCE public.product_sku_seq START 1;
CREATE TABLE public.categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, display_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.brands (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text NOT NULL UNIQUE, name text NOT NULL, slug text NOT NULL UNIQUE, category_id uuid NOT NULL REFERENCES public.categories(id), brand_id uuid REFERENCES public.brands(id), unit text NOT NULL, minimum_quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (minimum_quantity>0), step_quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (step_quantity>0), coverage_per_package numeric(12,3) CHECK (coverage_per_package IS NULL OR coverage_per_package>0), short_description text, description text, featured boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.product_variants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, name text NOT NULL, sku text NOT NULL UNIQUE, barcode text, color text, size text, length text, sale_price numeric(12,2) NOT NULL CHECK (sale_price>0), stock_quantity numeric(12,3) NOT NULL DEFAULT 0 CHECK (stock_quantity>=0), low_stock_threshold numeric(12,3) NOT NULL DEFAULT 0 CHECK (low_stock_threshold>=0), is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT product_variant_barcode_format CHECK (barcode IS NULL OR (barcode ~ '^[0-9]+);
CREATE UNIQUE INDEX product_variants_barcode_unique ON public.product_variants(barcode) WHERE barcode IS NOT NULL AND barcode<>'';
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS product_variant_barcode_length;
ALTER TABLE public.product_variants ADD CONSTRAINT product_variant_barcode_format CHECK (barcode IS NULL OR (barcode ~ '^[0-9]+$' AND length(barcode) IN (8,12,13,14)));
CREATE UNIQUE INDEX products_name_normalized_unique ON public.products (lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g')));
CREATE UNIQUE INDEX categories_name_normalized_unique ON public.categories (lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g')));
CREATE UNIQUE INDEX brands_name_normalized_unique ON public.brands (lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g')));
CREATE TABLE public.product_costs (variant_id uuid PRIMARY KEY REFERENCES public.product_variants(id) ON DELETE CASCADE, purchase_price numeric(12,2) NOT NULL CHECK (purchase_price>=0), updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.product_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, storage_path text NOT NULL UNIQUE, is_primary boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX product_images_one_primary ON public.product_images(product_id) WHERE is_primary=true;
CREATE TABLE public.product_search_terms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, term text NOT NULL, UNIQUE(product_id,term));
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, full_name text NOT NULL, role public.user_role NOT NULL DEFAULT 'viewer', is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), public_code text NOT NULL UNIQUE, status public.order_status NOT NULL DEFAULT 'request_created', customer_name text NOT NULL, customer_phone text NOT NULL, postal_code text, street text NOT NULL, number text NOT NULL, neighborhood text, city text, complement text, reference text, notes text, subtotal numeric(12,2) NOT NULL CHECK (subtotal>=0), total numeric(12,2) NOT NULL CHECK (total>=0), idempotency_key text NOT NULL UNIQUE, request_fingerprint text, stock_committed_at timestamptz, confirmed_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL, product_name_snapshot text NOT NULL, variant_name_snapshot text NOT NULL, sku_snapshot text, unit_snapshot text NOT NULL, unit_price numeric(12,2) NOT NULL CHECK (unit_price>=0), quantity numeric(12,3) NOT NULL CHECK (quantity>0), total_price numeric(12,2) NOT NULL CHECK (total_price>=0));
ALTER TABLE public.orders ADD COLUMN tracking_token text;
ALTER TABLE public.orders ADD CONSTRAINT orders_postal_code_format CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{8}$');
CREATE UNIQUE INDEX orders_tracking_token_unique ON public.orders(tracking_token) WHERE tracking_token IS NOT NULL;
CREATE TABLE public.stock_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT, type text NOT NULL CHECK (type IN ('opening_balance','purchase','sale','damage','inventory_adjustment','return')), quantity numeric(12,3) NOT NULL CHECK (quantity<>0), previous_quantity numeric(12,3) NOT NULL CHECK (previous_quantity>=0), new_quantity numeric(12,3) NOT NULL CHECK (new_quantity>=0), reason text NOT NULL, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movement_type_sign CHECK ((type IN ('opening_balance','purchase','return') AND quantity>0) OR (type IN ('sale','damage') AND quantity<0) OR (type='inventory_adjustment' AND quantity<>0));
CREATE TABLE public.product_variant_sku_counters (product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE, last_value integer NOT NULL DEFAULT 0 CHECK (last_value>=0));
CREATE TABLE public.admin_audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, action text NOT NULL, entity_type text NOT NULL, entity_id uuid, old_data jsonb, new_data jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.analytics_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_name text NOT NULL, order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.order_rate_limits (fingerprint text NOT NULL, scope text NOT NULL, window_started_at timestamptz NOT NULL, attempt_count integer NOT NULL DEFAULT 0, PRIMARY KEY(fingerprint,scope));
CREATE INDEX products_category_active_idx ON public.products(category_id,is_active); CREATE INDEX products_name_trgm_idx ON public.products USING gin(name gin_trgm_ops); CREATE INDEX variants_product_active_idx ON public.product_variants(product_id,is_active);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY; ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY; ALTER TABLE public.products ENABLE ROW LEVEL SECURITY; ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY; ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY; ALTER TABLE public.product_search_terms ENABLE ROW LEVEL SECURITY; ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY; ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY; ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Storage privado configurado pelo baseline. Arquivos existentes n�o s�o manipulados por esta migration.
-- allowed_mime_types: image/jpeg, image/png, image/webp (sem image/avif)
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES ('product-images','product-images',false,5242880,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=EXCLUDED.allowed_mime_types;

-- Rate limit de falhas de login (implementação estrutural inicial; regras finais serão consolidadas nas RPCs V1).
CREATE OR REPLACE FUNCTION public.check_login_failure_limit(p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer := 0;
BEGIN
  SELECT attempt_count INTO v_count FROM public.order_rate_limits WHERE fingerprint=p_fingerprint AND scope='login_failure' AND window_started_at >= now()-interval '10 minutes';
  RETURN jsonb_build_object('allowed', coalesce(v_count,0)<5, 'retry_after', CASE WHEN coalesce(v_count,0)<5 THEN 0 ELSE 600 END);
END; $$;
REVOKE ALL ON FUNCTION public.check_login_failure_limit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_login_failure_limit(text) TO service_role;
 AND length(barcode) IN (8,12,13,14))));
CREATE UNIQUE INDEX product_variants_barcode_unique ON public.product_variants(barcode) WHERE barcode IS NOT NULL AND barcode<>'';
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS product_variant_barcode_length;
ALTER TABLE public.product_variants ADD CONSTRAINT product_variant_barcode_format CHECK (barcode IS NULL OR (barcode ~ '^[0-9]+$' AND length(barcode) IN (8,12,13,14)));
CREATE UNIQUE INDEX products_name_normalized_unique ON public.products (lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g')));
CREATE UNIQUE INDEX categories_name_normalized_unique ON public.categories (lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g')));
CREATE UNIQUE INDEX brands_name_normalized_unique ON public.brands (lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g')));
CREATE TABLE public.product_costs (variant_id uuid PRIMARY KEY REFERENCES public.product_variants(id) ON DELETE CASCADE, purchase_price numeric(12,2) NOT NULL CHECK (purchase_price>=0), updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.product_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, storage_path text NOT NULL UNIQUE, is_primary boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX product_images_one_primary ON public.product_images(product_id) WHERE is_primary=true;
CREATE TABLE public.product_search_terms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, term text NOT NULL, UNIQUE(product_id,term));
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, full_name text NOT NULL, role public.user_role NOT NULL DEFAULT 'viewer', is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), public_code text NOT NULL UNIQUE, status public.order_status NOT NULL DEFAULT 'request_created', customer_name text NOT NULL, customer_phone text NOT NULL, postal_code text, street text NOT NULL, number text NOT NULL, neighborhood text, city text, complement text, reference text, notes text, subtotal numeric(12,2) NOT NULL CHECK (subtotal>=0), total numeric(12,2) NOT NULL CHECK (total>=0), idempotency_key text NOT NULL UNIQUE, request_fingerprint text, stock_committed_at timestamptz, confirmed_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL, product_name_snapshot text NOT NULL, variant_name_snapshot text NOT NULL, sku_snapshot text, unit_snapshot text NOT NULL, unit_price numeric(12,2) NOT NULL CHECK (unit_price>=0), quantity numeric(12,3) NOT NULL CHECK (quantity>0), total_price numeric(12,2) NOT NULL CHECK (total_price>=0));
ALTER TABLE public.orders ADD COLUMN tracking_token text;
ALTER TABLE public.orders ADD CONSTRAINT orders_postal_code_format CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{8}$');
CREATE UNIQUE INDEX orders_tracking_token_unique ON public.orders(tracking_token) WHERE tracking_token IS NOT NULL;
CREATE TABLE public.stock_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT, type text NOT NULL CHECK (type IN ('opening_balance','purchase','sale','damage','inventory_adjustment','return')), quantity numeric(12,3) NOT NULL CHECK (quantity<>0), previous_quantity numeric(12,3) NOT NULL CHECK (previous_quantity>=0), new_quantity numeric(12,3) NOT NULL CHECK (new_quantity>=0), reason text NOT NULL, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movement_type_sign CHECK ((type IN ('opening_balance','purchase','return') AND quantity>0) OR (type IN ('sale','damage') AND quantity<0) OR (type='inventory_adjustment' AND quantity<>0));
CREATE TABLE public.product_variant_sku_counters (product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE, last_value integer NOT NULL DEFAULT 0 CHECK (last_value>=0));
CREATE TABLE public.admin_audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, action text NOT NULL, entity_type text NOT NULL, entity_id uuid, old_data jsonb, new_data jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.analytics_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_name text NOT NULL, order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.order_rate_limits (fingerprint text NOT NULL, scope text NOT NULL, window_started_at timestamptz NOT NULL, attempt_count integer NOT NULL DEFAULT 0, PRIMARY KEY(fingerprint,scope));
CREATE INDEX products_category_active_idx ON public.products(category_id,is_active); CREATE INDEX products_name_trgm_idx ON public.products USING gin(name gin_trgm_ops); CREATE INDEX variants_product_active_idx ON public.product_variants(product_id,is_active);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY; ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY; ALTER TABLE public.products ENABLE ROW LEVEL SECURITY; ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY; ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY; ALTER TABLE public.product_search_terms ENABLE ROW LEVEL SECURITY; ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY; ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY; ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Storage privado configurado pelo baseline. Arquivos existentes n�o s�o manipulados por esta migration.
-- allowed_mime_types: image/jpeg, image/png, image/webp (sem image/avif)
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES ('product-images','product-images',false,5242880,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=EXCLUDED.allowed_mime_types;

-- Rate limit de falhas de login (implementação estrutural inicial; regras finais serão consolidadas nas RPCs V1).
CREATE OR REPLACE FUNCTION public.check_login_failure_limit(p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer := 0;
BEGIN
  SELECT attempt_count INTO v_count FROM public.order_rate_limits WHERE fingerprint=p_fingerprint AND scope='login_failure' AND window_started_at >= now()-interval '10 minutes';
  RETURN jsonb_build_object('allowed', coalesce(v_count,0)<5, 'retry_after', CASE WHEN coalesce(v_count,0)<5 THEN 0 ELSE 600 END);
END; $$;
REVOKE ALL ON FUNCTION public.check_login_failure_limit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_login_failure_limit(text) TO service_role;

ALTER TABLE public.categories ADD CONSTRAINT categories_name_nonempty CHECK (btrim(name) <> '');
ALTER TABLE public.brands ADD CONSTRAINT brands_name_nonempty CHECK (btrim(name) <> '');
ALTER TABLE public.products ADD CONSTRAINT products_name_nonempty CHECK (btrim(name) <> '');
ALTER TABLE public.products ADD CONSTRAINT products_unit_nonempty CHECK (btrim(unit) <> '');
ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_name_nonempty CHECK (btrim(name) <> '');
