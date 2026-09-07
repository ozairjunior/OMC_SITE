'use client';

import Link from 'next/link';
import { useCartStore } from '@/store/useCartStore';
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag, ArrowLeft } from 'lucide-react';

export default function CartPage() {
  const { items, updateQuantity, removeItem, getSubtotal, clearCart } = useCartStore();
  const subtotal = getSubtotal();

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="inline-flex p-4 bg-amber-50 text-amber-600 rounded-full">
          <ShoppingBag className="h-10 w-10" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Seu carrinho está vazio</h1>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          Navegue pelo nosso catálogo e adicione os materiais necessários para a sua obra.
        </p>
        <Link
          href="/produtos"
          className="inline-flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white font-medium px-6 py-3 rounded-xl transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar ao Catálogo</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Carrinho de Compras 🛒</h1>
        <button
          onClick={clearCart}
          className="text-xs text-red-600 hover:text-red-800 font-semibold"
        >
          Esvaziar carrinho
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Lista de Itens */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => {
            const itemTotal = item.price * item.quantity;

            return (
              <div
                key={item.variantId}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 flex-1">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                    {item.sku || 'SKU Padrão'}
                  </span>
                  <h3 className="font-semibold text-slate-800 text-sm">{item.name}</h3>
                  <p className="text-xs text-slate-500">Opção: {item.variantName}</p>
                  <p className="text-xs font-semibold text-slate-700">
                    R$ {item.price.toFixed(2)} / {item.unit}
                  </p>
                </div>

                {/* Controles de Quantidade */}
                <div className="flex items-center justify-between w-full sm:w-auto gap-4 border-t sm:border-t-0 pt-2 sm:pt-0">
                  <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-50">
                    <button
                      onClick={() => updateQuantity(item.variantId, item.quantity - item.stepQuantity)}
                      className="p-1.5 hover:bg-slate-200 text-slate-600 transition"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="px-3 text-xs font-bold text-slate-800">
                      {item.quantity} {item.unit}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.variantId, item.quantity + item.stepQuantity)}
                      disabled={Number.isFinite(item.maxStock) && item.quantity + item.stepQuantity > item.maxStock}
                      className="p-1.5 hover:bg-slate-200 text-slate-600 transition disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="text-right min-w-[80px]">
                    <span className="text-sm font-bold text-slate-900 block">
                      R$ {itemTotal.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={() => removeItem(item.variantId)}
                    className="p-2 text-slate-400 hover:text-red-600 rounded-lg transition"
                    title="Remover item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Resumo Financeiro */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit space-y-4">
          <h2 className="font-bold text-slate-900 text-base border-b pb-2">Resumo da Solicitação</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal dos itens:</span>
              <span className="font-semibold text-slate-900">R$ {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600 text-xs">
              <span>Frete:</span>
              <span className="text-amber-600 font-medium">A calcular no checkout</span>
            </div>
          </div>

          <div className="border-t pt-3 flex justify-between font-bold text-slate-900 text-base">
            <span>Total Estimado:</span>
            <span className="text-amber-700">R$ {subtotal.toFixed(2)}</span>
          </div>

          <Link
            href="/checkout"
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2 text-sm"
          >
            <span>Avançar para o Checkout</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
