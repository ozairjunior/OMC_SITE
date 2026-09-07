import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth/server';
import { Plus, Edit, Package, AlertCircle } from 'lucide-react';

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const { supabase } = await requireAdminPage();
  const filters = await searchParams;
  const page = Math.max(1, Number.parseInt(filters.pagina || '1', 10) || 1);
  const pageSize = 30;

  // Busca produtos com suas categorias e variações atreladas
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      sku,
      price,
      unit,
      is_active,
      categories ( name ),
      product_variants ( id, stock_quantity, low_stock_threshold, is_active )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    return <div className="p-6 text-red-600">Erro ao carregar produtos: {error.message}</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gerenciamento de Produtos 📦</h1>
          <p className="text-sm text-slate-500">Cadastre e edite o catálogo da loja</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/produtos/novo"
            className="bg-amber-600 hover:bg-amber-700 text-white font-medium px-4 py-2 rounded-lg flex items-center space-x-2 transition"
          >
            <Plus className="h-5 w-5" />
            <span>Novo Produto</span>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
            <tr>
              <th className="p-4">Produto</th>
              <th className="p-4">Categoria</th>
              <th className="p-4">Preço Base</th>
              <th className="p-4">Variações</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products?.map((product: any) => {
              const hasLowStock = product.product_variants?.some(
                (v: any) => v.is_active && v.stock_quantity <= v.low_stock_threshold
              );

              return (
                <tr key={product.id} className="hover:bg-slate-50">
                  <td className="p-4 font-medium text-slate-900">
                    {product.name}
                    {product.sku && <span className="block text-xs text-slate-400 font-mono">{product.sku}</span>}
                  </td>
                  <td className="p-4 text-slate-600">{product.categories?.name || 'Sem Categoria'}</td>
                  <td className="p-4 font-semibold text-slate-800">
                    R$ {Number(product.price).toFixed(2)} / {product.unit}
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Package className="h-4 w-4" />
                      {product.product_variants?.length || 0}
                    </span>
                    {hasLowStock && (
                      <span className="ml-2 inline-flex items-center text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                        <AlertCircle className="h-3 w-3 mr-1" /> Estoque Baixo
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      product.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {product.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/admin/produtos/${product.id}`}
                      className="inline-flex items-center p-2 text-slate-600 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition"
                    >
                      <Edit className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-center items-center gap-3">
        {page > 1 && <Link href={`/admin/produtos?pagina=${page - 1}`} className="px-3 py-2 border rounded-lg text-sm">Anterior</Link>}
        <span className="text-sm text-slate-500">Página {page}</span>
        {products?.length === pageSize && <Link href={`/admin/produtos?pagina=${page + 1}`} className="px-3 py-2 border rounded-lg text-sm">Próxima</Link>}
      </div>
    </div>
  );
}
