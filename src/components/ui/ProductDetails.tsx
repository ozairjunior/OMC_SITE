'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ShoppingCart, Check, Plus, Minus, PackageCheck, AlertTriangle } from 'lucide-react';
import { useCartStore } from '@/store/useCartStore';

interface Variant {
  id: string;
  name: string;
  sku: string | null;
  sale_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
}

interface ProductDetailsProps {
  product: {
    id: string;
    name: string;
    description?: string | null;
    brand?: string | null;
    price: number;
    unit: string;
    minimum_quantity: number;
    step_quantity: number;
    product_variants: Variant[];
    product_images?: Array<{ storage_path: string; is_primary: boolean }>;
  };
}

export function ProductDetails({ product }: ProductDetailsProps) {
  const variants = product.product_variants || [];
  const minimum = Number(product.minimum_quantity || 1);
  const step = Number(product.step_quantity || 1);
  const initialVariant = [...variants].sort((a, b) => {
    const aAvailable = Number(a.stock_quantity) >= minimum ? 0 : 1;
    const bAvailable = Number(b.stock_quantity) >= minimum ? 0 : 1;
    return aAvailable - bAvailable;
  })[0] || null;
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(initialVariant);
  const [quantity, setQuantity] = useState(minimum);
  const [added, setAdded] = useState(false);
  const addItem = useCartStore((state) => state.addItem);
  const unitPrice = Number(selectedVariant?.sale_price ?? product.price);
  const totalPrice = unitPrice * quantity;
  const primaryImage = (
    product.product_images?.find((image) => image.is_primary)
    || product.product_images?.[0]
  )?.storage_path;

  const handleIncrease = () => {
    if (!selectedVariant) return;
    setQuantity((current) => Math.min(Number((current + step).toFixed(4)), Number(selectedVariant.stock_quantity)));
  };
  const handleDecrease = () => {
    setQuantity((current) => Math.max(minimum, Number((current - step).toFixed(4))));
  };
  const handleAddToCart = () => {
    if (!selectedVariant || selectedVariant.stock_quantity < quantity) return;
    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      name: product.name,
      variantName: selectedVariant.name,
      sku: selectedVariant.sku || '',
      price: unitPrice,
      unit: product.unit,
      quantity,
      stepQuantity: step,
      minimumQuantity: minimum,
      maxStock: Number(selectedVariant.stock_quantity),
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <div className="relative h-80 sm:h-96 w-full bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center">
        {primaryImage ? (
          <Image src={primaryImage} alt={product.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
        ) : <span className="text-slate-400 text-sm">Sem imagem disponível</span>}
      </div>

      <div className="space-y-6 flex flex-col justify-between">
        <div className="space-y-3">
          {product.brand && <span className="text-xs font-bold text-amber-700 uppercase">Marca: {product.brand}</span>}
          <h1 className="text-2xl font-bold text-slate-900">{product.name}</h1>
          <p className="text-sm text-slate-600">{product.description || 'Sem descrição cadastrada.'}</p>
          {variants.length > 0 && (
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-semibold uppercase text-slate-700">Opção / Variação:</label>
              <div className="flex flex-wrap gap-2">
                {variants.map((variant) => (
                  <button
                    disabled={Number(variant.stock_quantity) < minimum}
                    key={variant.id}
                    onClick={() => { setSelectedVariant(variant); setQuantity(minimum); }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold border ${selectedVariant?.id === variant.id ? 'border-amber-600 bg-amber-50 text-amber-800' : 'border-slate-300'}`}
                  >{variant.name}{Number(variant.stock_quantity) < minimum && ' — Esgotado'}</button>
                ))}
              </div>
            </div>
          )}
          <div className="pt-2">
            {!selectedVariant ? (
              <span className="inline-flex text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">Produto sem variação disponível</span>
            ) : selectedVariant.stock_quantity < minimum ? (
              <span className="inline-flex text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">Esgotado no momento</span>
            ) : selectedVariant.stock_quantity <= selectedVariant.low_stock_threshold ? (
              <span className="inline-flex items-center text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full"><AlertTriangle className="h-3.5 w-3.5 mr-1" /> Últimas unidades disponíveis</span>
            ) : (
              <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full"><PackageCheck className="h-3.5 w-3.5 mr-1" /> Disponível em estoque</span>
            )}
          </div>
        </div>

        <div className="space-y-4 border-t pt-4">
          <div className="flex justify-between">
            <span className="text-2xl font-bold">R$ {unitPrice.toFixed(2)} <small>/ {product.unit}</small></span>
            <span className="text-xl font-bold text-amber-700">R$ {totalPrice.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center border rounded-lg bg-slate-50">
              <button onClick={handleDecrease} disabled={quantity <= minimum} className="p-2.5 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
              <span className="px-4 font-bold text-sm">{quantity} {product.unit}</span>
              <button onClick={handleIncrease} disabled={!selectedVariant || quantity + step > selectedVariant.stock_quantity} className="p-2.5 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
            </div>
            <button
              onClick={handleAddToCart}
              disabled={!selectedVariant || selectedVariant.stock_quantity < quantity}
              className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${added ? 'bg-emerald-600' : 'bg-amber-600 hover:bg-amber-700'} text-white disabled:opacity-50`}
            >
              {added ? <><Check className="h-5 w-5" /> Adicionado!</> : <><ShoppingCart className="h-5 w-5" /> Adicionar ao Carrinho</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
