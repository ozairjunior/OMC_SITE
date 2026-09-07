'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, Check } from 'lucide-react';
import { useCartStore } from '@/store/useCartStore';
import { useState } from 'react';

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    slug: string;
    brand?: string | null;
    price: number;
    unit: string;
    minimum_quantity: number;
    step_quantity: number;
    product_variants?: Array<{
      id: string;
      name: string;
      sku: string | null;
      sale_price: number;
      stock_quantity: number;
    }>;
    product_images?: Array<{ storage_path: string; is_primary: boolean }>;
  };
}

export function ProductCard({ product, compact = false, featured = false }: ProductCardProps & { compact?: boolean; featured?: boolean }) {
  const addItem = useCartStore((state) => state.addItem);
  const [added, setAdded] = useState(false);
  const minimum = Number(product.minimum_quantity || 1);
  const variants = product.product_variants || [];
  const defaultVariant = [...variants]
    .filter((variant) => Number(variant.stock_quantity) >= minimum)
    .sort((a, b) => Number(a.sale_price) - Number(b.sale_price))[0];
  const primaryImage = (
    product.product_images?.find((image) => image.is_primary)
    || product.product_images?.[0]
  )?.storage_path;
  const finalPrice = Number(defaultVariant?.sale_price ?? product.price);

  const handleAddToCart = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!defaultVariant) return;
    addItem({
      productId: product.id,
      variantId: defaultVariant.id,
      name: product.name,
      variantName: defaultVariant.name,
      sku: defaultVariant.sku || '',
      price: finalPrice,
      unit: product.unit,
      quantity: minimum,
      stepQuantity: Number(product.step_quantity || 1),
      minimumQuantity: minimum,
      maxStock: Number(defaultVariant.stock_quantity),
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden group">
      <Link href={`/produtos/${product.slug}`} className="block">
        <div className={`relative ${compact ? 'h-32' : 'h-48'} w-full bg-slate-100 flex items-center justify-center overflow-hidden`}>
          {featured && <span className="absolute right-2 top-2 z-10 rounded bg-amber-600 px-2 py-1 text-[10px] font-bold text-white">★ DESTAQUE</span>}
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover group-hover:scale-105 transition"
            />
          ) : <span className="text-slate-400 text-xs font-semibold uppercase">Sem imagem</span>}
        </div>
        <div className={`${compact ? 'p-3' : 'p-4'} space-y-2`}>
          {product.brand && <span className="text-[11px] font-bold text-amber-700 uppercase block">{product.brand}</span>}
          <h3 className="font-semibold text-slate-800 text-sm line-clamp-2">{product.name}</h3>
        </div>
      </Link>

      <div className={`${compact ? 'p-3' : 'p-4'} border-t border-slate-100 flex items-center justify-between`}>
        <div>
          <span className="text-xs text-slate-400 block">{defaultVariant ? 'A partir de' : 'Indisponível'}</span>
          <span className="text-lg font-bold text-slate-900">R$ {finalPrice.toFixed(2)}</span>
          <span className="text-xs text-slate-500"> / {product.unit}</span>
        </div>
        {variants.length > 1 ? <Link href={`/produtos/${product.slug}`} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white">Escolher opção</Link> : <button
          type="button"
          onClick={handleAddToCart}
          onTouchEnd={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.click(); }}
          disabled={!defaultVariant}
          className={`min-h-11 min-w-11 p-2.5 rounded-lg transition touch-manipulation ${added ? 'bg-emerald-600' : 'bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 disabled:cursor-not-allowed'} text-white`}
          title={defaultVariant ? 'Adicionar ao carrinho' : 'Produto sem estoque disponível'}
          aria-label={defaultVariant ? 'Adicionar ao carrinho' : 'Produto indisponível'}
        >
          {added ? <Check className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
        </button>}
      </div>
    </div>
  );
}
