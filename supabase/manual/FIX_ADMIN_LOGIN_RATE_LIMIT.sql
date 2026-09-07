-- Restaura a RPC usada pelo login administrativo.
-- Executar manualmente somente após revisão.
CREATE OR REPLACE FUNCTION public.check_login_failure_limit(p_fingerprint TEXT)
RETURNS TABLE(allowed BOOLEAN, retry_after INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(r.request_count < 5, true),
    COALESCE(
      GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (
          r.window_started_at + INTERVAL '10 minutes' - now()
        )))::INTEGER
      ),
      0
    )
  FROM public.order_rate_limits AS r
  WHERE r.fingerprint = p_fingerprint
    AND r.scope = 'login_failure';
$$;

REVOKE ALL ON FUNCTION public.check_login_failure_limit(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_failure_limit(TEXT)
  TO service_role;
