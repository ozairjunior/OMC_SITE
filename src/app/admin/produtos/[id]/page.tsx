import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/auth/server';
import { ProductFormWrapper } from '@/components/admin/ProductFormWrapper';
import type { ProductInput } from '@/lib/validations/product';
import { ImageUploader } from '@/components/admin/ImageUploader';
import { signedProductImageUrls } from '@/lib/images/urls';

type ProductVariantRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  color: string | null;
  size: string | null;
  length: string | null;
  sale_price: number | string | null;
  stock_quantity: number | string;
  low_stock_threshold: number | string | null;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  category_id: string | null;
  brand_id: string | null;
  name: string;
  slug: string;
  sku: string | null;
  barcode: string | null;
  short_description: string | null;
  description: string | null;
  brand: string | null;
  unit: ProductInput['unit'];
  price: number | string;
  minimum_quantity: number | string | null;
  step_quantity: number | string | null;
  coverage_per_package: number | string | null;
  featured: boolean;
  is_active: boolean;
  product_variants: ProductVariantRow[] | null;
  product_images: Array<{ id: string; storage_path: string; is_primary: boolean }> | null;
  product_search_terms: Array<{ term: string }> | null;
};

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdminPage();
  const { id } = await params;

  const [{ data: categories, error: categoriesError }, { data: brands, error: brandsError }, { data: cost }, { data, error: productError }] =
    await Promise.all([
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('brands').select('id, name, is_active').order('name'),
      supabase.from('product_costs').select('purchase_price').eq('product_id', id).maybeSingle(),
      supabase
        .from('products')
        .select(`
          id,
          category_id,
          name,
          slug,
          sku,
          barcode,
          short_description,
          description,
          brand,
          brand_id,
          unit,
          price,
          minimum_quantity,
          step_quantity,
          coverage_per_package,
          featured,
          is_active,
          product_variants (
            id,
            name,
            sku,
            barcode,
            color,
            size,
            length,
            sale_price,
            stock_quantity,
            low_stock_threshold,
            is_active
          ),
          product_images (id, storage_path, is_primary),
          product_search_terms (term)
        `)
        .eq('id', id)
        .maybeSingle(),
    ]);

  if (productError) {
    return (
      <div className="p-6 text-red-600">
        Erro ao carregar produto: {productError.message}
      </div>
    );
  }
  if (!data) notFound();
  if (categoriesError || brandsError || !categories?.length || !brands) {
    return <div className="p-6 text-red-600">Erro ao carregar categorias.</div>;
  }

  const product = data as ProductRow;
  product.product_images = await signedProductImageUrls(product.product_images || []);
  if (!product.category_id) {
    return (
      <div className="p-6 text-red-600">
        Este produto não possui uma categoria válida. Associe uma categoria no banco antes de editá-lo.
      </div>
    );
  }

  const initialData: ProductInput = {
    id: product.id,
    categoryId: product.category_id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    barcode: product.barcode,
    shortDescription: product.short_description,
    description: product.description,
    brand: product.brand,
    brandId: product.brand_id,
    unit: product.unit,
    price: Number(product.price),
    purchasePrice: cost?.purchase_price == null ? null : Number(cost.purchase_price),
    minimumQuantity: Number(product.minimum_quantity ?? 1),
    stepQuantity: Number(product.step_quantity ?? 1),
    coveragePerPackage:
      product.coverage_per_package === null ? null : Number(product.coverage_per_package),
    featured: product.featured,
    isActive: product.is_active,
    variants: (product.product_variants || []).map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      barcode: (variant as ProductVariantRow & { barcode?: string | null }).barcode,
      color: variant.color,
      size: variant.size,
      length: variant.length,
      salePrice: variant.sale_price == null ? null : Number(variant.sale_price),
      stockQuantity: Number(variant.stock_quantity),
      lowStockThreshold: Number(variant.low_stock_threshold ?? 5),
      isActive: variant.is_active,
    })),
    images: [],
    searchTerms: (product.product_search_terms || []).map((item) => item.term),
  };

  if (initialData.variants.length === 0) {
    initialData.variants.push({
      name: 'Padrão',
      sku: '',
      salePrice: null,
      stockQuantity: 0,
      lowStockThreshold: 5,
      isActive: true,
    });
  }

  return (
    <div className="py-6 space-y-4">
      <div className="flex justify-end">
      </div>
      <ProductFormWrapper
        categories={categories}
        brands={brands}
        productId={product.id}
        initialData={initialData}
      />
      <ImageUploader productId={product.id} images={product.product_images || []} />
    </div>
  );
}
