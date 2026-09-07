-- Limite amplo por IP nao bloqueia uma empresa inteira por cinco logins corretos.
-- Mantem RETURNS JSONB por compatibilidade com a RPC existente e com o backend.

ALTER TABLE public.order_rate_limits DROP CONSTRAINT IF EXISTS order_rate_limits_scope_check;
ALTER TABLE public.order_rate_limits ADD CONSTRAINT order_rate_limits_scope_check CHECK (scope IN ('attempt', 'login', 'login_ip', 'login_failure'));

CREATE OR REPLACE FUNCTION public.consume_order_rate_limit(p_fingerprint TEXT, p_scope TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_window INTERVAL := INTERVAL '10 minutes';
  v_limit INTEGER;
  v_count INTEGER;
  v_started TIMESTAMPTZ;
BEGIN
  IF p_fingerprint IS NULL OR length(p_fingerprint) <> 64 OR p_scope NOT IN ('attempt', 'login', 'login_ip', 'login_failure') THEN
    RAISE EXCEPTION 'Parametros de rate limit invalidos.' USING ERRCODE = '22023';
  END IF;
  v_limit := CASE WHEN p_scope = 'login_failure' THEN 5 WHEN p_scope = 'login' THEN 5 WHEN p_scope = 'login_ip' THEN 30 ELSE 30 END;
  DELETE FROM public.order_rate_limits WHERE updated_at < v_now - INTERVAL '24 hours';
  INSERT INTO public.order_rate_limits (fingerprint, scope, window_started_at, request_count, updated_at)
  VALUES (p_fingerprint, p_scope, v_now, 1, v_now)
  ON CONFLICT (fingerprint, scope) DO UPDATE SET
    window_started_at = CASE WHEN public.order_rate_limits.window_started_at <= v_now - v_window THEN v_now ELSE public.order_rate_limits.window_started_at END,
    request_count = CASE WHEN public.order_rate_limits.window_started_at <= v_now - v_window THEN 1 ELSE public.order_rate_limits.request_count + 1 END,
    updated_at = v_now
  RETURNING request_count, window_started_at INTO v_count, v_started;
  RETURN jsonb_build_object('allowed', v_count <= v_limit, 'retry_after', CASE WHEN v_count <= v_limit THEN 0 ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_started + v_window - v_now)))::INTEGER) END);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_order_rate_limit(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_rate_limit(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.check_login_failure_limit(p_fingerprint TEXT)
RETURNS TABLE(allowed BOOLEAN, retry_after INTEGER)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT r.request_count < 5 FROM public.order_rate_limits AS r WHERE r.fingerprint = p_fingerprint AND r.scope = 'login_failure' LIMIT 1), true) AS allowed,
    COALESCE((SELECT CASE WHEN r.request_count < 5 THEN 0 ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r.window_started_at + INTERVAL '10 minutes' - clock_timestamp())))::INTEGER) END FROM public.order_rate_limits AS r WHERE r.fingerprint = p_fingerprint AND r.scope = 'login_failure' LIMIT 1), 0) AS retry_after;
$$;

REVOKE ALL ON FUNCTION public.check_login_failure_limit(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_failure_limit(TEXT) TO service_role;
