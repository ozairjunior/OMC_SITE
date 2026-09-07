import { createClient } from '@/lib/supabase/server';
import { ProductDetails } from '@/components/ui/ProductDetails';
import { notFound } from 'next/navigation';
import { signedProductImageUrls } from '@/lib/images/urls';

interface ProductPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: product, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      description,
      brand,
      price,
      unit,
      minimum_quantity,
      step_quantity,
      categories ( name ),
      product_variants ( id, name, sku, sale_price, stock_quantity, low_stock_threshold ),
      product_images ( storage_path, is_primary )
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .eq('product_variants.is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Falha ao consultar o produto: ${error.message}`);
  }
  if (!product) {
    notFound();
  }
  product.product_images = await signedProductImageUrls(product.product_images || []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <ProductDetails product={product as any} />
    </div>
  );
}
