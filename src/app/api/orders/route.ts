import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createOrderSchema } from '@/lib/validations/order';
import { createOrderTrackingToken, publicOrderError, requestFingerprint } from '@/lib/orders/security';
import { consumeOrderBurstLimit } from '@/lib/orders/rate-limit';
import { getRequestId, logError } from '@/lib/observability/logger';

function rateLimited(retryAfter: number) {
  return NextResponse.json(
    { error: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    let fingerprint: string;
    try {
      fingerprint = requestFingerprint(request);
    } catch (error) {
      console.error('Identificacao segura do pedido indisponivel:', error);
      return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
    }
    const burst = consumeOrderBurstLimit(fingerprint);
    if (!burst.allowed) return rateLimited(burst.retryAfter);

    const supabase = createServiceClient();
    // Transacao separada: JSON invalido e falhas posteriores nao devolvem a cota.
    const { data: limit, error: limitError } = await supabase.rpc('consume_order_rate_limit', {
      p_fingerprint: fingerprint,
      p_scope: 'attempt',
    });
    if (limitError || typeof limit?.allowed !== 'boolean'
      || !Number.isInteger(limit?.retry_after) || limit.retry_after < 0 || limit.retry_after > 600) {
      console.error('Limite persistente de pedidos indisponivel:', limitError?.code || 'invalid_response');
      return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
    }
    if (!limit.allowed) return rateLimited(Math.max(1, limit.retry_after));

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 64 * 1024) {
      return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 });
    }
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > 64 * 1024) {
      return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const validation = createOrderSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos enviados no formulário', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const {
      customerName,
      customerPhone,
      address,
      addressNumber,
      neighborhood,
      city,
      complement,
      referencePoint,
      postalCode,
      notes,
      items,
      idempotencyKey,
    } = validation.data;

    // Consolidação de itens duplicados
    const consolidatedMap = new Map<string, number>();
    for (const item of items) {
      const current = consolidatedMap.get(item.variantId) || 0;
      consolidatedMap.set(item.variantId, current + item.quantity);
    }

    const preparedItems = Array.from(consolidatedMap.entries()).map(([variantId, quantity]) => ({
      variant_id: variantId,
      quantity,
    }));

    const trackingToken = createOrderTrackingToken(idempotencyKey);

    // A RPC so e acessivel pela API server-side e aplica rate limit persistente.
    const { data, error } = await supabase.rpc('create_catalog_order', {
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_address: address,
      p_address_number: addressNumber,
      p_neighborhood: neighborhood,
      p_city: city,
      p_complement: complement || '',
      p_reference_point: referencePoint || '',
      p_postal_code: postalCode || '',
      p_notes: notes || '',
      p_items: preparedItems,
      p_request_fingerprint: fingerprint,
      p_tracking_token: trackingToken,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      const safeError = publicOrderError(error.message, error.code);
      if (safeError.status >= 500) {
        logError(safeError.code, error, { requestId, route: '/api/orders' });
      }
      return NextResponse.json(
        { error: { code: safeError.code, message: safeError.message }, requestId },
        {
          status: safeError.status,
          headers: safeError.status === 429 ? { 'Retry-After': '600' } : undefined,
        }
      );
    }

    return NextResponse.json({ ...(data as object), trackingToken }, { status: 201 });
  } catch (error) {
    logError('ORDER_CREATE_INTERNAL', error, { requestId, route: '/api/orders' });
    return NextResponse.json({ error: 'Erro interno ao processar pedido' }, { status: 500 });
  }
}
