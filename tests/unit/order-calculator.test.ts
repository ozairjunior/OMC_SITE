import { describe, it, expect } from 'vitest';
import { calculateItemTotal, calculateOrderSubtotal, normalizeQuantity } from '@/lib/cart/calculations';

describe('Calculadora de Orçamentos e Carrinho', () => {
  it('deve calcular o total correto para um item com quantidade inteira', () => {
    const total = calculateItemTotal(50.0, 3);
    expect(total).toBe(150.0);
  });

  it('deve calcular o total correto para itens com frações (ex: metros de areia/piso)', () => {
    const total = calculateItemTotal(12.5, 2.5);
    expect(total).toBe(31.25);
  });

  it('deve somar o subtotal consolidado de múltiplos produtos no carrinho', () => {
    const items = [
      { price: 30.0, quantity: 2 }, // 60.00
      { price: 15.5, quantity: 4 }, // 62.00
    ];
    const subtotal = calculateOrderSubtotal(items);
    expect(subtotal).toBe(122.0);
  });

  it('deve respeitar quantidade mínima, incremento e estoque máximo', () => {
    expect(normalizeQuantity(1, 2, 0.5, 10)).toBe(2);
    expect(normalizeQuantity(3.2, 2, 0.5, 10)).toBe(3);
    expect(normalizeQuantity(20, 2, 0.5, 4.2)).toBe(4);
    expect(normalizeQuantity(1, 2, 0.5, 1)).toBe(0);
  });
});
