import { describe, expect, it } from 'vitest';
import { createOrderSchema, normalizePostalCode } from '@/lib/validations/order';
import { productSchema } from '@/lib/validations/product';

const validOrder = {
  idempotencyKey: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
  customerName: 'Cliente Teste',
  customerPhone: '(83) 99999-9999',
  address: 'Rua de Teste',
  addressNumber: '123',
  neighborhood: 'Centro',
  city: 'João Pessoa',
  items: [{ variantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', quantity: 2 }],
};

describe('validações de entrada públicas e administrativas', () => {
  it('limita campos do pedido ao tamanho suportado pelo banco', () => {
    expect(createOrderSchema.safeParse(validOrder).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...validOrder, customerName: 'x'.repeat(151) }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...validOrder, notes: 'x'.repeat(1001) }).success).toBe(false);
  });

  it.each(['58059-133', '58059133'])('normaliza CEP %s para oito digitos', (postalCode) => {
    const result = createOrderSchema.safeParse({ ...validOrder, postalCode });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.postalCode).toBe('58059133');
  });

  it('permite CEP vazio e rejeita formatos invalidos', () => {
    expect(createOrderSchema.safeParse({ ...validOrder, postalCode: '' }).success).toBe(true);
    for (const postalCode of ['58059', 'abcde-fgh', '580591333']) {
      expect(createOrderSchema.safeParse({ ...validOrder, postalCode }).success).toBe(false);
    }
    expect(normalizePostalCode('58059-133')).toBe('58059133');
  });

  it('rejeita slug que poderia gerar URL inválida', () => {
    const result = productSchema.safeParse({
      categoryId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      name: 'Produto válido', slug: 'Produto com espaço', unit: 'UN', price: 10,
      minimumQuantity: 1, stepQuantity: 1, featured: false, isActive: true,
      variants: [{ name: 'Padrão', stockQuantity: 1, salePrice: null, lowStockThreshold: 1, isActive: true }],
    });
    expect(result.success).toBe(false);
  });

  it('aceita campos numéricos opcionais vazios e preço exato de variação', () => {
    const base = {
      categoryId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      name: 'Produto válido', slug: 'produto-valido', unit: 'UN', price: 10,
      minimumQuantity: 1, stepQuantity: 1, coveragePerPackage: '',
      featured: false, isActive: true,
      variants: [{ name: 'Padrão', stockQuantity: 1, salePrice: '', lowStockThreshold: 1, isActive: true }],
    };
    expect(productSchema.safeParse(base).success).toBe(true);
    expect(productSchema.safeParse({ ...base, variants: [{ ...base.variants[0], salePrice: 12 }] }).success).toBe(true);
  });
});
