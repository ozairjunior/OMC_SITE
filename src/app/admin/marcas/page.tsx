import { requireAdminPage } from '@/lib/auth/server';
import { BrandManager } from '@/components/admin/BrandManager';

export default async function BrandsPage() {
  const { supabase } = await requireAdminPage();
  const { data, error } = await supabase.from('brands').select('id,name,slug,is_active,products(count)').order('name');
  if (error) return <main className="mx-auto max-w-5xl p-6 text-red-700">Não foi possível carregar as marcas.</main>;
  return <main className="mx-auto max-w-5xl p-6"><h1 className="mb-6 text-2xl font-bold">Marcas</h1><BrandManager initial={data ?? []} /></main>;
}
