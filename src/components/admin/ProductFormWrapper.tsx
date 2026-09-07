'use client';
import { useRouter } from 'next/navigation';
import { ProductForm } from './ProductForm';
import type { ProductInput } from '@/lib/validations/product';
interface Props { categories: { id: string; name: string }[]; brands: { id: string; name: string }[]; productId?: string; initialData?: ProductInput }
export function ProductFormWrapper({ categories, brands, productId, initialData }: Props) {
  const router = useRouter();
  const handleSubmit = async (data: ProductInput) => {
    try {
      const response = await fetch(productId ? `/api/admin/products/${productId}` : '/api/admin/products', { method: productId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(`Falha ao salvar produto: ${typeof result.error === 'string' ? result.error : `Erro HTTP ${response.status}`}`);
        return;
      }
      router.push('/admin/produtos');
      router.refresh();
    } catch (error) {
      console.error('Erro de rede ao salvar produto:', error);
      alert('Não foi possível salvar o produto. Verifique sua conexão e tente novamente.');
    }
  };
  const handleArchive = productId ? async () => { if (!confirm('Arquivar este produto?')) return; const response = await fetch(`/api/admin/products/${productId}`, { method: 'DELETE' }); const result = await response.json(); if (!response.ok) { alert(result.error || 'Falha ao arquivar produto.'); return; } router.push('/admin/produtos'); router.refresh(); } : undefined;
  return <ProductForm categories={categories} brands={brands} initialData={initialData} onSubmit={handleSubmit} onArchive={handleArchive} />;
}
