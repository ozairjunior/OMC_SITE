BEGIN;
UPDATE public.products
SET price = CASE WHEN promotional_price IS NOT NULL AND promotional_price > 0 THEN promotional_price ELSE price END,
    promotional_price = NULL;
CREATE TABLE IF NOT EXISTS public.product_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE, purchase_price NUMERIC(12,2) NOT NULL CHECK (purchase_price >= 0),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((product_id IS NOT NULL) <> (variant_id IS NOT NULL)), UNIQUE(product_id), UNIQUE(variant_id)
);
ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers Read Product Costs" ON public.product_costs;
CREATE POLICY "Managers Read Product Costs" ON public.product_costs FOR SELECT TO authenticated USING (public.has_role(ARRAY['admin','manager']::public.user_role[]));
REVOKE ALL ON public.product_costs FROM anon, authenticated;
GRANT SELECT ON public.product_costs TO authenticated;
COMMIT;
