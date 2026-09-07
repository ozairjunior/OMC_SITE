import 'server-only';

import { randomUUID } from 'node:crypto';

export type RequestContext = { requestId: string; route?: string; userId?: string };

export function getRequestId(request?: Request) {
  const supplied = request?.headers.get('x-request-id');
  return supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : randomUUID();
}

export function logError(code: string, error: unknown, context: RequestContext) {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  const message = error instanceof Error ? error.message : record?.message ? String(record.message) : String(error);
  const providerCode = record?.code ? String(record.code) : undefined;
  console.error(JSON.stringify({ level: 'error', code, providerCode, message, ...context, timestamp: new Date().toISOString() }));
}
