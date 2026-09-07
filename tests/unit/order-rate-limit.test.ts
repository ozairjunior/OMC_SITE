import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { createOrderBurstLimiter } from '@/lib/orders/rate-limit';

describe('prefiltro de rajada de pedidos', () => {
  it('bloqueia a sexta tentativa e libera após a janela', () => {
    const consume = createOrderBurstLimiter();
    for (let attempt = 0; attempt < 5; attempt += 1) expect(consume('ip', 1_000).allowed).toBe(true);
    expect(consume('ip', 1_000)).toEqual({ allowed: false, retryAfter: 10 });
    expect(consume('ip', 11_000).allowed).toBe(true);
  });
});
