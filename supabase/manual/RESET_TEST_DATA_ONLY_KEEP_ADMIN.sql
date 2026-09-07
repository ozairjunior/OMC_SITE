BEGIN;

-- Preflight: validate Auth and the administrator profile before any change.
-- The email is the source of truth; the UUID is an additional safeguard.
DO $$
DECLARE
  v_count integer;
  v_admin_id uuid;
BEGIN
  SELECT count(*)
    INTO v_count
  FROM auth.users AS u
  WHERE lower(u.email) = lower('jjunior2100@gmail.com');

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Abortado: esperado exatamente um usuario Auth jjunior2100@gmail.com; encontrados %.', v_count;
  END IF;
  SELECT u.id INTO v_admin_id
  FROM auth.users AS u
  WHERE lower(u.email) = lower('jjunior2100@gmail.com');
  IF v_admin_id <> '7c589d00-68b7-4cd4-b73e-03ef6dd5b4a9'::uuid THEN
    RAISE EXCEPTION 'Abortado: UUID do administrador nao corresponde ao UUID validado.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_admin_id AND role = 'admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Abortado: profile do administrador nao esta ativo como admin.';
  END IF;
END $$;

-- Remove only non-admin application profiles. Auth users and Auth-owned data
-- (identities, sessions, refresh tokens and MFA factors) are never touched.
DELETE FROM public.profiles
WHERE id <> (
  SELECT u.id
  FROM auth.users AS u
  WHERE lower(u.email) = lower('jjunior2100@gmail.com')
);

-- Explicit list: no CASCADE and no trigger/session bypass.
TRUNCATE TABLE
  public.order_items,
  public.analytics_events,
  public.orders,
  public.stock_movements,
  public.product_costs,
  public.product_images,
  public.product_search_terms,
  public.product_variant_sku_counters,
  public.product_variants,
  public.products,
  public.brands,
  public.categories,
  public.order_rate_limits,
  public.order_rate_limit_events,
  public.security_monitor_events,
  public.admin_audit_logs;

ALTER SEQUENCE public.product_sku_seq RESTART WITH 1;
ALTER SEQUENCE public.order_code_seq RESTART WITH 1000;

-- Storage objects, bucket configuration and data_retention_policies are not
-- touched by this SQL. product_images only contains database references.

-- Validate every cleared table and the preserved administrator before commit.
DO $$
DECLARE
  v_admin_id uuid;
  v_count bigint;
BEGIN
  SELECT u.id INTO v_admin_id
  FROM auth.users AS u
  WHERE lower(u.email) = lower('jjunior2100@gmail.com');

  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = v_admin_id AND lower(email) = lower('jjunior2100@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Abortado: administrador Auth nao foi preservado.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_admin_id AND role = 'admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Abortado: profile do administrador nao foi preservado.';
  END IF;
  IF (SELECT count(*) FROM public.profiles) <> 1 THEN
    RAISE EXCEPTION 'Abortado: deveria existir somente o profile do administrador.';
  END IF;

  SELECT count(*) INTO v_count FROM public.order_items; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: order_items nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.orders; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: orders nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.analytics_events; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: analytics_events nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.stock_movements; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: stock_movements nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.product_costs; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: product_costs nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.product_images; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: product_images nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.product_search_terms; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: product_search_terms nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.product_variant_sku_counters; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: product_variant_sku_counters nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.product_variants; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: product_variants nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.products; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: products nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.brands; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: brands nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.categories; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: categories nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.order_rate_limits; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: order_rate_limits nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.order_rate_limit_events; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: order_rate_limit_events nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.security_monitor_events; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: security_monitor_events nao esta vazia.'; END IF;
  SELECT count(*) INTO v_count FROM public.admin_audit_logs; IF v_count <> 0 THEN RAISE EXCEPTION 'Abortado: admin_audit_logs nao esta vazia.'; END IF;
END $$;

COMMIT;
