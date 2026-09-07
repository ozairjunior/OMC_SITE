import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requestFingerprint } from '@/lib/orders/security';

export async function POST(request: Request) {
  try {
    const fingerprint = requestFingerprint(request);
    const service = createServiceClient();
    const { data: failureState, error: failureError } = await service.rpc('check_login_failure_limit', { p_fingerprint: fingerprint });
    if (failureError) {
      console.error('Rate limit login_failure indisponivel:', { code: failureError.code, message: failureError.message });
      return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
    }
    const failure = rpcRow(failureState);
    if (failure?.allowed === false) return NextResponse.json({ error: 'Muitas tentativas falhas. Aguarde alguns minutos.' }, { status: 429, headers: { 'Retry-After': String(failure.retry_after || 600) } });
    const { data, error } = await service.rpc('consume_order_rate_limit', { p_fingerprint: fingerprint, p_scope: 'login_ip' });
    if (error) {
      console.error('Rate limit login_ip indisponivel:', { code: error.code, message: error.message });
      return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
    }
    const limit = rpcRow(data);
    if (!limit || typeof limit.allowed !== 'boolean') {
      console.error('Rate limit login_ip retornou formato invalido.');
      return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
    }
    if (!limit.allowed) return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429, headers: { 'Retry-After': String(limit.retry_after || 600) } });
    return NextResponse.json({ allowed: true });
  } catch (error) {
    console.error('Falha no rate limit do login:', error instanceof Error ? error.message : 'erro desconhecido');
    return NextResponse.json({ error: 'Serviço temporariamente indisponível.' }, { status: 503 });
  }
}

function rpcRow(value: unknown): { allowed?: boolean; retry_after?: number } | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === 'object' ? row as { allowed?: boolean; retry_after?: number } : null;
}
