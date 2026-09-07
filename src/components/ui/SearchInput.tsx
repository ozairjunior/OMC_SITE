'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';

export function SearchInput() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();
  const urlSearchTerm = searchParams.get('q') || '';

  // Estado local do input para resposta visual imediata
  const [searchTerm, setSearchTerm] = useState(urlSearchTerm);

  useEffect(() => {
    setSearchTerm((current) => current === urlSearchTerm ? current : urlSearchTerm);
  }, [urlSearchTerm]);

  useEffect(() => {
    // Timer para aplicar o Debounce de 300ms
    const timer = setTimeout(() => {
      const params = new URLSearchParams(currentQuery);
      const normalizedSearch = searchTerm.trim();

      if (normalizedSearch) {
        params.set('q', normalizedSearch);
      } else {
        params.delete('q');
      }

      if (normalizedSearch !== urlSearchTerm) params.delete('pagina');

      const nextQuery = params.toString();
      if (nextQuery === currentQuery) return;

      // Atualiza a URL mantendo outros filtros (como categoria)
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }, 300);

    return () => clearTimeout(timer); // Limpa o timer se o usuário continuar digitando
  }, [searchTerm, pathname, router, currentQuery, urlSearchTerm]);

  return (
    <div className="relative w-full max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Buscar por produto, marca ou SKU..."
        className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
      {searchTerm && (
        <button
          onClick={() => setSearchTerm('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
