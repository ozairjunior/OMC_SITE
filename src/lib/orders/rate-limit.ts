import 'server-only';

type Bucket = { count: number; expiresAt: number };

// Prefiltro por instancia. O limite global e aplicado atomicamente no Supabase.
export function createOrderBurstLimiter() {
  const buckets = new Map<string, Bucket>();
  const windowMs = 10_000;
  const maxEntries = 5_000;

  return (fingerprint: string, now = Date.now()) => {
    let bucket = buckets.get(fingerprint);
    if (!bucket || bucket.expiresAt <= now) {
      for (const [key, entry] of buckets) {
        if (entry.expiresAt <= now) buckets.delete(key);
      }
      // Nao expulsa cotas ativas para abrir espaco a novas identidades.
      if (buckets.size >= maxEntries) return { allowed: false, retryAfter: 10 };
      bucket = { count: 0, expiresAt: now + windowMs };
      buckets.set(fingerprint, bucket);
    }
    if (bucket.count >= 5) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)) };
    }
    bucket.count += 1;
    return { allowed: true, retryAfter: 0 };
  };
}

export const consumeOrderBurstLimit = createOrderBurstLimiter();
