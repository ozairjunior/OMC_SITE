import { describe, expect, it } from 'vitest';
import { isSupportedBarcode, normalizeGtin, productSchema } from '@/lib/validations/product';
import { slugifyProductName } from '@/lib/products/slug';
import { productConflictMessage } from '@/lib/products/database-errors';

describe('integridade do cadastro de mercadorias', () => {
  it('gera slug estável sem acentos ou hífens duplicados', () => {
    expect(slugifyProductName('Cimento Votorán  CP II 50kg')).toBe('cimento-votoran-cp-ii-50kg');
  });
  it.each(['96385074', '036000291452', '4006381333931', '00012345678905'])('aceita código com tamanho comercial %s', (value) => expect(isSupportedBarcode(value)).toBe(true));
  it.each(['1234567', '123456789', '123456789012345'])('rejeita código com tamanho incompatível %s', (value) => expect(isSupportedBarcode(value)).toBe(false));
  it('normaliza máscara de GTIN', () => expect(normalizeGtin('400.638.133-3931')).toBe('4006381333931'));
  it('rejeita preço de compra negativo e preço de venda não positivo', () => {
    const base = { categoryId: 'c1000000-0000-0000-0000-000000000001', name: 'Produto de teste', slug: 'produto-de-teste', unit: 'UN', price: 10, variants: [{ name: 'Padrão', salePrice: null, stockQuantity: 0, lowStockThreshold: 0, isActive: true }] };
    expect(productSchema.safeParse({ ...base, purchasePrice: -1 }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, price: 0 }).success).toBe(false);
  });
  it('aceita código comercial sem conferir o dígito verificador', () => {
    const base = { categoryId: 'c1000000-0000-0000-0000-000000000001', name: 'Produto de teste', slug: 'produto-de-teste', unit: 'UN', price: 10, variants: [{ name: 'Padrão', salePrice: null, stockQuantity: 0, lowStockThreshold: 0, isActive: true }] };
    expect(productSchema.safeParse({ ...base, barcode: '7908642003460' }).success).toBe(true);
  });
  it('aceita uma marca cadastrada ou a ausência de marca', () => {
    const base = { categoryId: 'c1000000-0000-0000-0000-000000000001', name: 'Produto de teste', slug: 'produto-de-teste', unit: 'UN', price: 10, variants: [{ name: 'Padrão', salePrice: null, stockQuantity: 0, lowStockThreshold: 0, isActive: true }] };
    expect(productSchema.safeParse({ ...base, brandId: 'b1000000-0000-0000-0000-000000000001' }).success).toBe(true);
    expect(productSchema.safeParse({ ...base, brandId: '' }).success).toBe(true);
  });
  it.each([
    ['products_slug_key', 'A URL deste produto já está sendo utilizada por outro produto.'],
    ['products_sku_unique', 'Este código/SKU já está cadastrado em outro produto ou variação.'],
    ['products_barcode_unique', 'Este código de barras já está cadastrado em outro produto ou variação.'],
    ['idx_products_name_normalized_unique', 'Já existe um produto cadastrado com esse nome.'],
  ])('traduz o conflito %s sem mascará-lo como slug', (constraint, message) => {
    expect(productConflictMessage({ code: '23505', message: `duplicate key violates unique constraint "${constraint}"` })).toBe(message);
  });
});
