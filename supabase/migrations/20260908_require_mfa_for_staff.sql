-- Admin e manager precisam de sessão Supabase com assurance level aal2.
BEGIN;
ALTER TABLE public.order_rate_limits DROP CONSTRAINT IF EXISTS order_rate_limits_scope_check;
ALTER TABLE public.order_rate_limits ADD CONSTRAINT order_rate_limits_scope_check CHECK (scope IN ('attempt', 'login'));
CREATE OR REPLACE FUNCTION public.has_role(allowed_roles public.user_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_active = true AND role = ANY(allowed_roles)
      AND (role NOT IN ('admin'::public.user_role, 'manager'::public.user_role)
        OR (auth.jwt() ->> 'aal') = 'aal2')
  );
$$;

CREATE OR REPLACE FUNCTION public.consume_order_rate_limit(p_fingerprint TEXT, p_scope TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp(); v_count INTEGER; v_started TIMESTAMPTZ; v_limit INTEGER;
BEGIN
  IF length(p_fingerprint) <> 64 OR p_scope NOT IN ('attempt', 'login') THEN
    RAISE EXCEPTION 'Parametros de rate limit invalidos.' USING ERRCODE = '22023';
  END IF;
  v_limit := CASE WHEN p_scope = 'login' THEN 5 ELSE 30 END;
  DELETE FROM public.order_rate_limits WHERE updated_at < v_now - INTERVAL '24 hours';
  INSERT INTO public.order_rate_limits(fingerprint, scope, window_started_at, request_count, updated_at)
  VALUES (p_fingerprint, p_scope, v_now, 1, v_now)
  ON CONFLICT (fingerprint, scope) DO UPDATE SET
    window_started_at = CASE WHEN order_rate_limits.window_started_at <= v_now - INTERVAL '10 minutes' THEN v_now ELSE order_rate_limits.window_started_at END,
    request_count = CASE WHEN order_rate_limits.window_started_at <= v_now - INTERVAL '10 minutes' THEN 1 ELSE order_rate_limits.request_count + 1 END,
    updated_at = v_now
  RETURNING request_count, window_started_at INTO v_count, v_started;
  RETURN jsonb_build_object('allowed', v_count <= v_limit,
    'retry_after', CASE WHEN v_count <= v_limit THEN 0 ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_started + INTERVAL '10 minutes' - v_now)))::INTEGER) END);
END; $$;
REVOKE ALL ON FUNCTION public.consume_order_rate_limit(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_rate_limit(TEXT, TEXT) TO service_role;
COMMIT;
