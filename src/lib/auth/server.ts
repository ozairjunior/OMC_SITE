import 'server-only';

import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_ROLES, getCurrentProfile, getCurrentUser, requireRole, type AuthFailure } from '@/lib/auth/access';

function deniedUrl(failure: AuthFailure) {
  return `/admin/acesso-negado?reason=${failure.code}`;
}

export async function requireAdminPage() {
  const supabase = await createClient();
  const authorization = await requireRole(supabase, ADMIN_ROLES);

  if (!authorization.ok) {
    if (authorization.code === 'unauthenticated') {
      redirect('/admin/login');
    }
    redirect(deniedUrl(authorization));
  }

  return { supabase, user: authorization.user, profile: authorization.profile };
}

export async function requireAdminSetupPage() {
  const supabase = await createClient();
  const authentication = await getCurrentUser(supabase);
  if (!authentication.ok) redirect('/admin/login');
  const profileResult = await getCurrentProfile(supabase, authentication.user.id);
  if (!profileResult.ok || !profileResult.profile.is_active || !['admin', 'manager'].includes(profileResult.profile.role)) {
    redirect(`/admin/acesso-negado?reason=${profileResult.ok ? 'role_forbidden' : profileResult.code}`);
  }
  return { supabase, user: authentication.user, profile: profileResult.profile };
}

export async function requireAdminApi(request?: Request) {
  const supabase = await createClient();
  const authorization = await requireRole(supabase, ADMIN_ROLES);

  if (!authorization.ok) {
    const status =
      authorization.code === 'unauthenticated'
        ? 401
        : authorization.code === 'profile_query_failed'
          ? 500
          : 403;
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Não foi possível acessar o painel.', ...(process.env.NODE_ENV !== 'production' ? { code: authorization.code } : {}) },
        { status, headers: { 'Cache-Control': 'private, no-store' } }
      ),
    };
  }

  if (request && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
    && !validateAdminOrigin(request)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Origem da requisição não permitida.' },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
      ),
    };
  }

  return {
    ok: true as const,
    supabase,
    user: authorization.user,
    profile: authorization.profile,
  };
}

export function validateAdminOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    const configured = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host : host;
    const localDevelopment = process.env.NODE_ENV !== 'production'
      && ['localhost:3000', '127.0.0.1:3000'].includes(originUrl.host);
    return originUrl.host === host && (originUrl.host === configured || localDevelopment);
  } catch {
    return false;
  }
}
