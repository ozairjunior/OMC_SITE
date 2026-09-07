'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Layers } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface CategoryPillsProps {
  categories: Category[];
}

export function CategoryPills({ categories }: CategoryPillsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get('categoria') || '';

  const handleSelectCategory = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('pagina');

    if (slug === currentCategory) {
      params.delete('categoria'); // Desseleciona se já estiver ativa
    } else if (slug) {
      params.set('categoria', slug);
    } else {
      params.delete('categoria');
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none">
      {/* Botão para Mostrar Todos */}
      <button
        onClick={() => handleSelectCategory('')}
        className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
          !currentCategory
            ? 'bg-amber-600 text-white shadow-sm'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        <Layers className="h-3.5 w-3.5" />
        <span>Todos os Produtos</span>
      </button>

      {/* Lista de Categorias em Pills */}
      {categories.map((cat) => {
        const isActive = currentCategory === cat.slug;
        return (
          <button
            key={cat.id}
            onClick={() => handleSelectCategory(cat.slug)}
            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {cat.name}
          </button>
        );
      })}
    </div>
  );
}
