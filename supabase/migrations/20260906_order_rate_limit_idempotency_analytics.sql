-- Rate limit atomico, idempotencia e eventos distintos do funil do WhatsApp.
-- Executar depois de 20260905_preserve_used_product_variants.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.order_rate_limits (
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  scope TEXT NOT NULL CHECK (scope IN ('attempt')),
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fingerprint, scope)
);
CREATE INDEX IF NOT EXISTS idx_order_rate_limits_updated_at ON public.order_rate_limits(updated_at);
ALTER TABLE public.order_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_order_rate_limit(p_fingerprint TEXT, p_scope TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_count INTEGER;
  v_started TIMESTAMPTZ;
BEGIN
  IF length(p_fingerprint) <> 64 OR p_scope <> 'attempt' THEN
    RAISE EXCEPTION 'Parametros de rate limit invalidos.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.order_rate_limits WHERE updated_at < v_now - INTERVAL '24 hours';

  INSERT INTO public.order_rate_limits(fingerprint, scope, window_started_at, request_count, updated_at)
  VALUES (p_fingerprint, p_scope, v_now, 1, v_now)
  ON CONFLICT (fingerprint, scope) DO UPDATE SET
    window_started_at = CASE
      WHEN order_rate_limits.window_started_at <= v_now - INTERVAL '10 minutes' THEN v_now
      ELSE order_rate_limits.window_started_at
    END,
    request_count = CASE
      WHEN order_rate_limits.window_started_at <= v_now - INTERVAL '10 minutes' THEN 1
      ELSE order_rate_limits.request_count + 1
    END,
    updated_at = v_now
  RETURNING request_count, window_started_at INTO v_count, v_started;

  RETURN jsonb_build_object(
    'allowed', v_count <= 30,
    'retry_after', CASE WHEN v_count <= 30 THEN 0
      ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_started + INTERVAL '10 minutes' - v_now)))::INTEGER)
    END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.consume_order_rate_limit(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_rate_limit(TEXT, TEXT) TO service_role;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS idempotency_payload_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON public.orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Preserva uma unica ocorrencia de cada evento por pedido antes da constraint.
DELETE FROM public.analytics_events duplicate
USING public.analytics_events original
WHERE duplicate.order_id = original.order_id
  AND duplicate.event_name = original.event_name
  AND duplicate.id > original.id
  AND duplicate.order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_order_event_unique
  ON public.analytics_events(order_id, event_name) WHERE order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_catalog_order(
  p_customer_name TEXT, p_customer_phone TEXT, p_address TEXT, p_address_number TEXT,
  p_neighborhood TEXT, p_city TEXT, p_complement TEXT, p_reference_point TEXT,
  p_postal_code TEXT, p_notes TEXT, p_items JSONB, p_request_fingerprint TEXT,
  p_tracking_token TEXT, p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.orders%ROWTYPE;
  v_result JSONB;
  v_payload_hash TEXT;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Chave de idempotencia invalida.' USING ERRCODE = '22023';
  END IF;
  v_payload_hash := encode(digest(concat_ws('|',
    btrim(p_customer_name), btrim(p_customer_phone), btrim(p_address), btrim(p_address_number),
    btrim(p_neighborhood), btrim(p_city), COALESCE(btrim(p_complement), ''),
    COALESCE(btrim(p_reference_point), ''), COALESCE(btrim(p_postal_code), ''),
    COALESCE(btrim(p_notes), ''), COALESCE(p_items::TEXT, 'null')
  ), 'sha256'), 'hex');

  -- Mesma ordem de locks em todas as chamadas: idempotencia e depois identidade.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::TEXT, 0));
  SELECT * INTO v_existing FROM public.orders WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.idempotency_payload_hash IS DISTINCT FROM v_payload_hash
      OR v_existing.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
      RAISE EXCEPTION 'Chave de idempotencia reutilizada com dados diferentes.' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'orderId', v_existing.id, 'publicCode', v_existing.public_code, 'total', v_existing.total,
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'name', product_name_snapshot, 'variantName', variant_name_snapshot,
        'unit', unit_snapshot, 'quantity', quantity, 'unitPrice', unit_price,
        'totalPrice', total_price) ORDER BY id)
        FROM public.order_items WHERE order_id = v_existing.id), '[]'::JSONB),
      'idempotentReplay', true
    );
  END IF;

  -- Serializa o COUNT + INSERT da RPC anterior por fingerprint.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_fingerprint, 1));
  v_result := public.create_catalog_order(
    p_customer_name, p_customer_phone, p_address, p_address_number, p_neighborhood,
    p_city, p_complement, p_reference_point, p_postal_code, p_notes, p_items,
    p_request_fingerprint, p_tracking_token
  );
  UPDATE public.orders SET
    idempotency_key = p_idempotency_key,
    idempotency_payload_hash = v_payload_hash
  WHERE id = (v_result->>'orderId')::UUID;

  INSERT INTO public.analytics_events(session_id, event_name, order_id)
  VALUES ('checkout', 'order_created', (v_result->>'orderId')::UUID)
  ON CONFLICT (order_id, event_name) WHERE order_id IS NOT NULL DO NOTHING;
  RETURN v_result || jsonb_build_object('idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.create_catalog_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT
) FROM service_role;
REVOKE ALL ON FUNCTION public.create_catalog_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalog_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID
) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_order_whatsapp_link_shown(
  p_order_id UUID, p_tracking_token TEXT, p_session_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id
      AND public_tracking_token_hash = encode(digest(p_tracking_token, 'sha256'), 'hex')
  ) THEN RETURN false; END IF;
  INSERT INTO public.analytics_events(session_id, event_name, order_id)
  VALUES (left(COALESCE(NULLIF(p_session_id, ''), 'checkout'), 100), 'whatsapp_link_shown', p_order_id)
  ON CONFLICT (order_id, event_name) WHERE order_id IS NOT NULL DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_order_whatsapp_link_shown(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_whatsapp_link_shown(UUID, TEXT, TEXT)
  TO service_role;

-- A constraint unica torna o evento seguro mesmo sob cliques simultaneos.
CREATE OR REPLACE FUNCTION public.mark_order_whatsapp_clicked(
  p_order_id UUID, p_tracking_token TEXT, p_session_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_updated_id UUID;
BEGIN
  UPDATE public.orders SET
    status = CASE WHEN status IN ('request_created', 'checkout_started')
      THEN 'whatsapp_clicked'::public.order_status ELSE status END,
    whatsapp_clicked_at = COALESCE(whatsapp_clicked_at, NOW()), updated_at = NOW()
  WHERE id = p_order_id
    AND public_tracking_token_hash = encode(digest(p_tracking_token, 'sha256'), 'hex')
    AND status IN ('request_created', 'checkout_started', 'whatsapp_clicked')
  RETURNING id INTO v_updated_id;
  IF v_updated_id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.analytics_events(session_id, event_name, order_id)
  VALUES (left(COALESCE(NULLIF(p_session_id, ''), 'checkout'), 100), 'whatsapp_clicked', p_order_id)
  ON CONFLICT (order_id, event_name) WHERE order_id IS NOT NULL DO NOTHING;
  RETURN true;
END;
$$;

COMMIT;
