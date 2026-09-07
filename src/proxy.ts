import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { ADMIN_ROLES, requireRole } from '@/lib/auth/access';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const authorization = await requireRole(supabase, ADMIN_ROLES);
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === '/admin/login';
  const isAccessDenied = pathname === '/admin/acesso-negado';
  const redirectWithCookies = (path: string) => {
    const redirectResponse = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    redirectResponse.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return redirectResponse;
  };

  if (authorization.ok) {
    if (isLogin || isAccessDenied) return redirectWithCookies('/admin/dashboard');
  } else if (authorization.code === 'unauthenticated') {
    if (!isLogin) return redirectWithCookies('/admin/login');
  } else if (authorization.code === 'mfa_required' && pathname === '/admin/seguranca') {
    // A tela de segurança precisa ficar acessível para cadastrar o primeiro TOTP.
  } else if (!isAccessDenied) {
    return redirectWithCookies(`/admin/acesso-negado?reason=${authorization.code}`);
  }

  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export const config = { matcher: ['/admin/:path*'] };
