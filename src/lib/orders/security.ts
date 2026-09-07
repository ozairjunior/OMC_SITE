import 'server-only';

import { createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

export function createOrderTrackingToken(idempotencyKey?: string) {
  if (!idempotencyKey) return `${randomUUID()}${randomUUID()}`.replaceAll('-', '');
  return createHmac('sha256', rateLimitSecret()).update(`tracking:v1:${idempotencyKey}`).digest('hex');
}

export function requestFingerprint(request: Request) {
  const isVercel = process.env.VERCEL === '1';
  const isLocal = !isVercel && ['development', 'test'].includes(process.env.NODE_ENV || '');
  const secret = rateLimitSecret();

  // Apenas o proxy da Vercel e confiavel em producao. Nunca inferir o proxy
  // pela presenca de headers nem aceitar fallbacks enviados pelo cliente.
  let identity = 'local-development';
  if (isVercel) {
    const ip = request.headers.get('x-vercel-forwarded-for')?.trim() || '';
    if (ip.includes('%') || !isIP(ip)) throw new Error('IP confiavel da Vercel ausente ou invalido.');
    identity = normalizedIp(ip);
  } else if (!isLocal) {
    throw new Error('Proxy de producao nao suportado para o limite de pedidos.');
  }
  return createHmac('sha256', secret).update(`orders:v2:${identity}`).digest('hex');
}

function rateLimitSecret() {
  const isLocal = process.env.VERCEL !== '1' && ['development', 'test'].includes(process.env.NODE_ENV || '');
  const secret = process.env.ORDER_RATE_LIMIT_SECRET || (isLocal ? 'local-development-order-rate-limit-secret' : '');
  if (secret.length < 32) throw new Error('ORDER_RATE_LIMIT_SECRET deve ter pelo menos 32 caracteres.');
  return secret;
}

function normalizedIp(ip: string) {
  if (isIP(ip) === 4) return ip;
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  // IPv4 mapeado em IPv6 deve compartilhar a cota do mesmo IPv4.
  if (canonical.startsWith('::ffff:')) {
    const parts = canonical.slice(7).split(':').map((part) => Number.parseInt(part, 16));
    return [parts[0] >> 8, parts[0] & 255, parts[1] >> 8, parts[1] & 255].join('.');
  }
  const [left, right] = canonical.split('::');
  const start = left ? left.split(':') : [];
  const end = right ? right.split(':') : [];
  const groups = right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill('0'), ...end];
  // Agrupa /64 para que enderecos temporarios da mesma rede nao renovem a cota.
  return `${groups.slice(0, 4).map((group) => group.padStart(4, '0')).join(':')}::/64`;
}

export function publicOrderError(message?: string, providerCode?: string) {
  if (message?.includes('Limite temporario')) {
    return { status: 429, code: 'ORDER_RATE_LIMITED', message: 'Muitas solicitacoes. Aguarde alguns minutos e tente novamente.' };
  }
  if (message?.includes('Estoque insuficiente')) {
    return { status: 409, code: 'ORDER_STOCK_CONFLICT', message: 'Um dos itens nao possui mais estoque suficiente.' };
  }
  if (message?.includes('Quantidade') || message?.includes('indisponivel')) {
    return { status: 400, code: 'ORDER_ITEMS_INVALID', message: 'Um dos itens ou quantidades nao esta mais disponivel.' };
  }
  if (providerCode === '23514') {
    return { status: 400, code: 'ORDER_DATA_INVALID', message: 'Os dados da solicitacao nao sao validos.' };
  }
  return { status: 500, code: providerCode === '23505' ? 'ORDER_IDEMPOTENCY_CONFLICT' : 'ORDER_RPC_FAILED', message: 'Nao foi possivel registrar a solicitacao neste momento.' };
}
