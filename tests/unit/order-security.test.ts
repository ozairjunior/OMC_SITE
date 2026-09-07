import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('identidade segura de pedidos', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('ORDER_RATE_LIMIT_SECRET', 'a'.repeat(32));
    vi.stubEnv('VERCEL', '1');
  });

  it('ignora User-Agent e headers genéricos controláveis', async () => {
    const { requestFingerprint } = await import('@/lib/orders/security');
    const request = (agent: string, spoofed: string) => new Request('https://example.test/api/orders', { headers: {
      'x-vercel-forwarded-for': '2001:db8:abcd:12::1',
      'x-forwarded-for': spoofed,
      'x-real-ip': spoofed,
      'user-agent': agent,
    }});
    expect(requestFingerprint(request('agent-a', '1.1.1.1'))).toBe(requestFingerprint(request('agent-b', '8.8.8.8')));
  });

  it('agrupa endereços IPv6 da mesma rede /64', async () => {
    const { requestFingerprint } = await import('@/lib/orders/security');
    const request = (ip: string) => new Request('https://example.test', { headers: { 'x-vercel-forwarded-for': ip } });
    expect(requestFingerprint(request('2001:db8:1:2::1'))).toBe(requestFingerprint(request('2001:db8:1:2:ffff::2')));
    expect(requestFingerprint(request('2001:db8:1:2::1'))).not.toBe(requestFingerprint(request('2001:db8:1:3::1')));
  });

  it('falha fechada sem IP da Vercel ou segredo de produção', async () => {
    const { requestFingerprint } = await import('@/lib/orders/security');
    expect(() => requestFingerprint(new Request('https://example.test'))).toThrow('IP confiavel');
    vi.stubEnv('ORDER_RATE_LIMIT_SECRET', 'curto');
    expect(() => requestFingerprint(new Request('https://example.test', { headers: { 'x-vercel-forwarded-for': '1.2.3.4' } }))).toThrow('32 caracteres');
  });

  it('gera o mesmo token para retries da mesma chave', async () => {
    const { createOrderTrackingToken } = await import('@/lib/orders/security');
    const key = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
    expect(createOrderTrackingToken(key)).toBe(createOrderTrackingToken(key));
    expect(createOrderTrackingToken(key)).not.toBe(createOrderTrackingToken('f47ac10b-58cc-4372-a567-0e02b2c3d481'));
  });
});
