import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { calculateOrderSubtotal, normalizeQuantity } from '@/lib/cart/calculations';

export interface CartItem {
  productId: string;
  variantId: string;
  name: string;
  variantName: string;
  sku: string;
  price: number;
  unit: string;
  quantity: number;
  stepQuantity: number;
  minimumQuantity: number;
  maxStock: number;
  imageUrl?: string;
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
  getSubtotal: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (newItem) => {
        const currentItems = get().items;
        const existingIndex = currentItems.findIndex(i => i.variantId === newItem.variantId);

        if (existingIndex > -1) {
          const updated = [...currentItems];
          const existing = updated[existingIndex];
          updated[existingIndex] = {
            ...existing,
            ...newItem,
            quantity: normalizeQuantity(
              existing.quantity + newItem.quantity,
              newItem.minimumQuantity,
              newItem.stepQuantity,
              newItem.maxStock
            ),
          };
          set({ items: updated });
        } else {
          set({ items: [...currentItems, newItem] });
        }
      },
      removeItem: (variantId) => {
        set({ items: get().items.filter(i => i.variantId !== variantId) });
      },
      updateQuantity: (variantId, quantity) => {
        set({
          items: get().items.map((item) => {
            if (item.variantId !== variantId) return item;
            const normalized = normalizeQuantity(
              quantity,
              item.minimumQuantity,
              item.stepQuantity,
              item.maxStock ?? Number.POSITIVE_INFINITY
            );
            return { ...item, quantity: normalized || item.minimumQuantity };
          }),
        });
      },
      clearCart: () => set({ items: [] }),
      getSubtotal: () => {
        return calculateOrderSubtotal(get().items);
      },
    }),
    {
      name: 'omc_cart_storage',
    }
  )
);
