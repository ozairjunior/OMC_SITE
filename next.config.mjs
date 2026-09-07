if (process.env.OMC_LOCAL_TEST === 'true') {
  const localUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let parsedUrl;
  try {
    parsedUrl = new URL(localUrl || '');
  } catch {
    throw new Error('OMC_LOCAL_TEST exige NEXT_PUBLIC_SUPABASE_URL local em http://127.0.0.1:54321.');
  }
  const isAllowedLocalUrl =
    parsedUrl.protocol === 'http:' &&
    (parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === 'localhost') &&
    parsedUrl.port === '54321' &&
    parsedUrl.pathname === '/';
  if (!isAllowedLocalUrl) {
    throw new Error('OMC_LOCAL_TEST nao permite Supabase remoto; use http://127.0.0.1:54321.');
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.OMC_LOCAL_TEST === 'true' ? '.next-test' : '.next',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async headers() {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const contentSecurityPolicy = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co'}`,
      "font-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co'} ${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', 'wss://') || 'wss://*.supabase.co'}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          ...(isDevelopment ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
        ],
      },
    ];
  },
};

export default nextConfig;
