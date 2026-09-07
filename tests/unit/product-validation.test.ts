import { describe, expect, it } from 'vitest';
import { productSchema } from '@/lib/validations/product';

const product = {
  categoryId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  name: 'Produto teste', slug: 'produto-teste', unit: 'UN', price: 10,
  variants: [{ name: 'Padrão', salePrice: null }],
};

describe('preço de venda das variações', () => {
  it.each([0, -1, -20])('rejeita preço exato não positivo %s', (salePrice) => {
    expect(productSchema.safeParse({ ...product, variants: [{ name: 'Padrão', salePrice }] }).success).toBe(false);
  });

  it.each([0.01, 8, 100])('aceita preço exato positivo %s', (salePrice) => {
    expect(productSchema.safeParse({ ...product, variants: [{ name: 'Padrão', salePrice }] }).success).toBe(true);
  });

  it('permite omitir o preço da variação para herdar o preço do produto', () => {
    expect(productSchema.safeParse(product).success).toBe(true);
  });

  it('aceita valores do formulário como strings e rejeita infinito', () => {
    expect(productSchema.safeParse({ ...product, price: '10', variants: [{ name: 'Padrão', salePrice: '9.99' }] }).success).toBe(true);
    expect(productSchema.safeParse({ ...product, variants: [{ name: 'Padrão', salePrice: Infinity }] }).success).toBe(false);
  });
});
