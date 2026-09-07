import { z } from 'zod';

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return value.trim();
}

export function normalizePostalCode(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits;
}

export function formatPostalCode(value: string) {
  const digits = normalizePostalCode(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export const orderItemSchema = z.object({
  variantId: z.string().uuid('ID de variação inválido'),
  quantity: z.number().positive('A quantidade deve ser maior que zero'),
});

export const createOrderSchema = z.object({
  idempotencyKey: z.string().uuid('Chave de idempotência inválida'),
  customerName: z.string().trim().min(3, 'Nome deve ter pelo menos 3 caracteres').max(150),
  customerPhone: z.string().trim().transform(normalizePhone).refine((value) => /^\+55\d{10,11}$/.test(value), 'Telefone inválido'),
  address: z.string().trim().min(3, 'Endereço obrigatório').max(200),
  addressNumber: z.string().trim().min(1, 'Número obrigatório').max(20),
  neighborhood: z.string().trim().min(2, 'Bairro obrigatório').max(100),
  city: z.string().trim().min(2, 'Cidade obrigatória').max(100),
  complement: z.string().trim().max(100).optional(),
  referencePoint: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().refine((value) => value === '' || (/^[\d\s-]+$/.test(value) && normalizePostalCode(value).length === 8), 'CEP inválido').transform(normalizePostalCode).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(orderItemSchema).min(1, 'Selecione pelo menos um item').max(50, 'Máximo de 50 itens por pedido'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
