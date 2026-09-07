import os from 'node:os';
if (process.env.OMC_LOCAL_TEST === 'true') {
  const localUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isLanTest = process.env.OMC_LAN_TEST === 'true';
  const lanIp = process.env.OMC_LAN_IP;
  let parsedUrl;
  try {
    parsedUrl = new URL(localUrl || '');
  } catch {
    throw new Error('OMC_LOCAL_TEST exige NEXT_PUBLIC_SUPABASE_URL local em http://127.0.0.1:54321.');
  }
  const isAllowedLocalUrl =
    parsedUrl.protocol === 'http:' &&
    ((isLanTest ? parsedUrl.hostname === lanIp : (parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === 'localhost'))) &&
    parsedUrl.port === '54321' &&
    parsedUrl.pathname === '/';
  if (!isAllowedLocalUrl) {
    throw new Error('OMC_LOCAL_TEST nao permite Supabase remoto; use http://127.0.0.1:54321.');
  }
}

/** @type {import('next').NextConfig} */
const lanAddresses = Object.values(os.networkInterfaces()).flat().filter((entry) => entry?.family === 'IPv4' && !entry.internal && /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(entry.address)).map((entry) => entry.address);
const detectedLanIp = lanAddresses.find((address) => address.startsWith('192.168.')) || lanAddresses.find((address) => address.startsWith('10.')) || lanAddresses[0];
const devLanHost = process.env.OMC_LAN_IP || detectedLanIp;

const nextConfig = {
  distDir: process.env.OMC_LOCAL_TEST === 'true' ? '.next-test' : '.next',
  ...(process.env.OMC_LOCAL_TEST === 'true' ? { env: { OMC_LAN_TEST: process.env.OMC_LAN_TEST, NEXT_PUBLIC_CART_DEBUG: process.env.NEXT_PUBLIC_CART_DEBUG } } : {}),
  ...(process.env.NODE_ENV !== 'production' && devLanHost ? { allowedDevOrigins: [devLanHost, '127.0.0.1'] } : {}),
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      ...(process.env.OMC_LAN_TEST === 'true' && process.env.OMC_LAN_IP ? [{ protocol: 'http', hostname: process.env.OMC_LAN_IP, port: '54321', pathname: '/storage/v1/object/**' }] : []),
    ],
  },
  async headers() {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const lanSupabaseUrl = process.env.OMC_LAN_TEST === 'true' && process.env.OMC_LAN_IP ? 'http://' + process.env.OMC_LAN_IP + ':54321' : null;
    const lanSupabaseWs = lanSupabaseUrl ? lanSupabaseUrl.replace('http://', 'ws://') : null;
    const contentSecurityPolicy = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co'}${lanSupabaseUrl ? ` ${lanSupabaseUrl}` : ''}`,
      "font-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co'} ${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', 'wss://') || 'wss://*.supabase.co'}${lanSupabaseUrl ? ` ${lanSupabaseUrl} ${lanSupabaseWs}` : ''}`,
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
