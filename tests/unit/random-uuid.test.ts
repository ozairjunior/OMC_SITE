import { describe, expect, it, vi } from 'vitest';
import { randomUuid } from '@/lib/browser/random-uuid';

describe('randomUuid', () => {
  it('usa crypto.randomUUID quando disponível', () => {
    const native = '123e4567-e89b-42d3-a456-426614174000';
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => native), getRandomValues: vi.fn() });
    expect(randomUuid()).toBe(native);
  });
  it('gera UUID v4 RFC 4122 com getRandomValues', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => { bytes.fill(0); return bytes; } });
    const uuid = randomUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid[14]).toBe('4'); expect('89ab').toContain(uuid[19]);
  });
  it('gera UUIDs consecutivos diferentes', () => {
    let seed = 0; vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => { bytes.forEach((_, i) => { bytes[i] = seed++; }); return bytes; } });
    expect(randomUuid()).not.toBe(randomUuid());
  });
});