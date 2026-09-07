import { requireAdminPage } from '@/lib/auth/server';
import { StockManager } from '@/components/admin/StockManager';

export default async function StockPage() {
  const { supabase } = await requireAdminPage();
  const { data } = await supabase.from('product_variants').select('id, name, stock_quantity, low_stock_threshold, products(name)').eq('is_active', true).order('name');
  return <main className="mx-auto max-w-6xl p-6"><h1 className="mb-6 text-2xl font-bold">Controle de estoque</h1><StockManager variants={(data ?? []).map((item: any) => ({ ...item, productName: item.products?.name ?? 'Produto' }))} /></main>;
}
