import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateAdminOrigin } from '@/lib/auth/server';

export async function POST(request: Request) {
  if (!validateAdminOrigin(request)) {
    return NextResponse.json(
      { error: { code: 'CSRF_ORIGIN_DENIED', message: 'Origem da requisiÃ§Ã£o nÃ£o permitida.' } },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
  const supabase = await createClient();
  const { error }: { error: any } = await supabase.auth.signOut({ scope: 'local' });

  if (error) {
    console.error('AUTH_LOGOUT_FAILED', error.code || 'unknown');
    return NextResponse.json(
      { error: { code: 'AUTH_LOGOUT_FAILED', message: 'NÃ£o foi possÃ­vel encerrar a sessÃ£o.' } },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  if (error) {
    return NextResponse.json(
      { error: `Não foi possível encerrar a sessão: ${error.message}` },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  return NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
  );
}
