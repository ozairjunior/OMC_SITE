import { requireAdminPage } from '@/lib/auth/server';
import { CategoryManager } from '@/components/admin/CategoryManager';
export default async function CategoriesPage() { const { supabase } = await requireAdminPage(); const { data } = await supabase.from('categories').select('id,name,slug,display_order,is_active,products(count)').order('display_order').order('name'); return <main className="mx-auto max-w-5xl p-6"><h1 className="mb-6 text-2xl font-bold">Categorias</h1><CategoryManager initial={data ?? []} /></main>; }
