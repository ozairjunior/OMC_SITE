import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requestFingerprint } from '@/lib/orders/security';
export async function POST(request: Request) {
  try {
    const fingerprint = requestFingerprint(request);
    await createServiceClient().rpc('consume_order_rate_limit', { p_fingerprint: fingerprint, p_scope: 'login_failure' });
  } catch { /* Login continua retornando mensagem genérica. */ }
  return NextResponse.json({ accepted: true }, { headers: { 'Cache-Control': 'no-store' } });
}
