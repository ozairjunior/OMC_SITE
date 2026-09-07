BEGIN;
CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, slug TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS brands_slug_unique ON public.brands(slug);
CREATE UNIQUE INDEX IF NOT EXISTS brands_name_unique ON public.brands(lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')));
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id) ON DELETE RESTRICT;
INSERT INTO public.brands(name, slug)
SELECT DISTINCT btrim(brand), regexp_replace(lower(regexp_replace(btrim(brand), '\\s+', ' ', 'g')), '[^a-z0-9]+', '-', 'g')
FROM public.products WHERE NULLIF(btrim(brand), '') IS NOT NULL ON CONFLICT DO NOTHING;
UPDATE public.products p SET brand_id = b.id FROM public.brands b
WHERE p.brand_id IS NULL AND lower(regexp_replace(btrim(p.brand), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim(b.name), '\\s+', ' ', 'g'));
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Active Brands" ON public.brands;
CREATE POLICY "Public Read Active Brands" ON public.brands FOR SELECT USING (is_active OR public.has_role(ARRAY['admin','manager']::public.user_role[]));
REVOKE INSERT, UPDATE, DELETE ON public.brands FROM anon, authenticated;
COMMIT;
