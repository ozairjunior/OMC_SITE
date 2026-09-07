-- Limite amplo por IP nao bloqueia uma empresa inteira por cinco logins corretos.
-- A camada menor fica reservada para falhas reportadas pelo frontend.
ALTER TABLE public.order_rate_limits DROP CONSTRAINT IF EXISTS order_rate_limits_scope_check;
ALTER TABLE public.order_rate_limits ADD CONSTRAINT order_rate_limits_scope_check CHECK (scope IN ('attempt','login_ip','login_failure'));
CREATE OR REPLACE FUNCTION public.consume_order_rate_limit(p_fingerprint TEXT, p_scope TEXT)
RETURNS TABLE(allowed BOOLEAN, retry_after INTEGER) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_now TIMESTAMPTZ := now(); v_window INTERVAL; v_limit INTEGER; v_row public.order_rate_limits;
BEGIN
  IF length(p_fingerprint) <> 64 OR p_scope NOT IN ('attempt','login_ip','login_failure') THEN RAISE EXCEPTION 'Rate limit invalido'; END IF;
  v_window := CASE WHEN p_scope = 'login_failure' THEN interval '10 minutes' ELSE interval '10 minutes' END;
  v_limit := CASE WHEN p_scope = 'login_failure' THEN 5 WHEN p_scope = 'login_ip' THEN 30 ELSE 30 END;
  INSERT INTO public.order_rate_limits(fingerprint, scope, window_started_at, request_count, updated_at)
  VALUES (p_fingerprint, p_scope, v_now, 1, v_now)
  ON CONFLICT (fingerprint, scope) DO UPDATE SET
    window_started_at = CASE WHEN public.order_rate_limits.window_started_at < v_now - v_window THEN v_now ELSE public.order_rate_limits.window_started_at END,
    request_count = CASE WHEN public.order_rate_limits.window_started_at < v_now - v_window THEN 1 ELSE public.order_rate_limits.request_count + 1 END,
    updated_at = v_now
  RETURNING * INTO v_row;
  allowed := v_row.request_count <= v_limit;
  retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_row.window_started_at + v_window - v_now)))::INTEGER);
  RETURN NEXT;
END; $$;

CREATE OR REPLACE FUNCTION public.check_login_failure_limit(p_fingerprint TEXT)
RETURNS TABLE(allowed BOOLEAN, retry_after INTEGER) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(r.request_count < 5, true),
    COALESCE(GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r.window_started_at + interval '10 minutes' - now())))::INTEGER), 0)
  FROM (SELECT * FROM public.order_rate_limits WHERE fingerprint = p_fingerprint AND scope = 'login_failure') r;
$$;
REVOKE ALL ON FUNCTION public.check_login_failure_limit(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_failure_limit(TEXT) TO service_role;
