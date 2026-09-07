CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_normalized_unique
ON public.products (lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')));
