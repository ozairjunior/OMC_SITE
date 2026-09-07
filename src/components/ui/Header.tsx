'use client';

import Link from 'next/link';
import { ShoppingCart, HardHat, Search } from 'lucide-react';
import { useCartStore } from '@/store/useCartStore';

export function Header() {
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <header className="sticky top-0 z-40 bg-amber-600 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <HardHat className="h-8 w-8 text-amber-200" />
          <div>
            <span className="font-bold text-lg sm:text-xl tracking-tight block leading-none">
              Oliveira
            </span>
            <span className="text-xs text-amber-100 block">Material de Construção</span>
          </div>
        </Link>

        <div className="flex items-center space-x-4">
          <Link
            href="/produtos"
            className="hidden sm:flex items-center space-x-1 hover:text-amber-200 transition-colors text-sm font-medium"
          >
            <Search className="h-4 w-4" />
            <span>Catálogo</span>
          </Link>

          <Link
            href="/carrinho"
            className="relative flex items-center bg-amber-700 hover:bg-amber-800 px-3 py-2 rounded-lg transition-colors"
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="ml-2 font-semibold text-sm hidden xs:inline">Carrinho</span>
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                {itemCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}