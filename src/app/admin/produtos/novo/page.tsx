import { requireAdminPage } from '@/lib/auth/server';
import { ProductFormWrapper } from '@/components/admin/ProductFormWrapper';

export default async function NewProductPage() {
  const { supabase } = await requireAdminPage();

  // Consulta as categorias ativas para o select do formulário
  const [{ data: categories, error }, { data: brands, error: brandsError }] = await Promise.all([
    supabase.from('categories').select('id, name').eq('is_active', true).order('name'),
    supabase.from('brands').select('id, name').eq('is_active', true).order('name'),
  ]);

  if (error || brandsError || !categories || !brands) {
    return (
      <div className="p-6 text-red-600">
        Erro ao carregar categorias para o cadastro.
      </div>
    );
  }

  return (
    <div className="py-6 space-y-4">
      <div className="flex justify-end">
      </div>
      <ProductFormWrapper categories={categories} brands={brands} />
    </div>
  );
}
