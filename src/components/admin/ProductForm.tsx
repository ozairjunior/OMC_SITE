'use client';

import { useFieldArray, useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { productSchema, type ProductInput, unitTypeEnum } from '@/lib/validations/product';
import { Plus, Trash2, Save, ArrowLeft, Archive } from 'lucide-react';
import Link from 'next/link';
import { slugifyProductName } from '@/lib/products/slug';

interface Props {
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  initialData?: Partial<ProductInput>;
  onSubmit: (data: ProductInput) => Promise<void>;
  onArchive?: () => Promise<void>;
}

const inputClass = 'w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none';

export function ProductForm({ categories, brands, initialData, onSubmit, onArchive }: Props) {
  const { register, control, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: initialData || {
      name: '', slug: '', sku: null, barcode: null, categoryId: categories[0]?.id || '', brandId: null, brand: null, unit: 'UN',
      price: 0, purchasePrice: null, minimumQuantity: 1, stepQuantity: 1,
      featured: false, isActive: true, searchTerms: [], images: [],
      variants: [{ name: 'Padrão', sku: '', stockQuantity: 0, salePrice: null, lowStockThreshold: 5, isActive: true }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'variants' });
  const variants = watch('variants');
  const productName = watch('name');
  useEffect(() => { if (!initialData?.id) setValue('slug', slugifyProductName(productName || ''), { shouldValidate: true }); }, [initialData?.id, productName, setValue]);
  const searchTerms = watch('searchTerms') || [];
  const salePrice = Number(watch('price') || 0);
  const purchasePrice = watch('purchasePrice');
  const grossProfit = purchasePrice == null ? null : salePrice - Number(purchasePrice);
  const margin = grossProfit == null || salePrice <= 0 ? null : (grossProfit / salePrice) * 100;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submit = handleSubmit(async (data) => {
    setSubmitError(null);
    await onSubmit(data);
  }, (validationErrors) => {
    console.error('Erros de validação do produto:', validationErrors);
    const detail = firstValidationMessage(validationErrors);
    setSubmitError(detail ? `Não foi possível salvar: ${detail}` : 'Revise os campos destacados antes de salvar o produto.');
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-8 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between border-b pb-4 gap-3">
        <div className="flex items-center gap-3"><Link href="/admin/produtos" className="p-2 text-slate-500"><ArrowLeft className="h-5 w-5" /></Link><h1 className="text-xl font-bold">{initialData?.id ? 'Editar produto' : 'Novo produto'}</h1></div>
        <div className="flex gap-2">
          {onArchive && <button type="button" onClick={onArchive} className="border border-red-300 text-red-700 px-4 py-2.5 rounded-lg flex items-center gap-2"><Archive className="h-4 w-4" /> Arquivar</button>}
          <button type="submit" disabled={isSubmitting} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50"><Save className="h-4 w-4" /> {isSubmitting ? 'Salvando...' : 'Salvar produto'}</button>
        </div>
      </div>
      {submitError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</p>}

      <section className="bg-white p-6 rounded-xl border shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
        <h2 className="md:col-span-2 font-semibold border-b pb-2">Dados principais</h2>
        <Field label="Nome *" error={errors.name?.message}><input {...register('name')} maxLength={150} className={inputClass} /></Field>
        <Field label="Código/SKU"><input value={initialData?.sku || 'Será gerado automaticamente ao salvar'} readOnly className={`${inputClass} bg-slate-100 text-slate-500`} /></Field>
        <input type="hidden" {...register('slug')} />
        {errors.slug?.message && <p className="md:col-span-2 text-xs text-red-600">{errors.slug.message}</p>}
        <Field label="Categoria *" error={errors.categoryId?.message}><select {...register('categoryId')} className={inputClass}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
        <Field label="Marca" error={errors.brandId?.message}><select {...register('brandId')} className={inputClass}><option value="">Sem marca</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></Field>
        <Field label="Unidade *"><select {...register('unit')} className={inputClass}>{unitTypeEnum.options.map((unit) => <option key={unit}>{unit}</option>)}</select></Field>
        <Field label="Código de barras (GTIN)" error={errors.barcode?.message}><input {...register('barcode')} maxLength={14} inputMode="numeric" placeholder="Opcional" className={inputClass} /></Field>
        <Field label="Preço de venda *" error={errors.price?.message}><input type="number" min="0.01" step="0.01" {...register('price')} className={inputClass} /></Field>
        <Field label="Preço de compra (interno)" error={errors.purchasePrice?.message}><input type="number" min="0" step="0.01" {...register('purchasePrice')} className={inputClass} /></Field>
        {margin != null && <div className="rounded-lg bg-slate-50 p-3 text-sm"><div>Custo: R$ {Number(purchasePrice).toFixed(2)}</div><div>Venda: R$ {salePrice.toFixed(2)}</div><div className="font-bold">Lucro bruto unitário: R$ {grossProfit?.toFixed(2)} · Margem: {margin.toFixed(1)}%</div></div>}
        <Field label="Quantidade mínima" error={errors.minimumQuantity?.message}><input type="number" min="0.01" step="0.01" {...register('minimumQuantity')} className={inputClass} /></Field>
        <Field label="Incremento de compra" error={errors.stepQuantity?.message}><input type="number" min="0.01" step="0.01" {...register('stepQuantity')} className={inputClass} /></Field>
        <Field label="Cobertura por embalagem"><input type="number" min="0.01" step="0.01" {...register('coveragePerPackage')} className={inputClass} /></Field>
        <Field label="Termos de busca (separados por vírgula)"><input value={searchTerms.join(', ')} onChange={(event) => setValue('searchTerms', event.target.value.split(',').map((term) => term.trim()).filter(Boolean), { shouldValidate: true })} className={inputClass} /></Field>
        <div className="md:col-span-2"><Field label="Descrição curta"><input {...register('shortDescription')} maxLength={255} className={inputClass} /></Field></div>
        <div className="md:col-span-2"><Field label="Descrição completa"><textarea {...register('description')} rows={4} className={inputClass} /></Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('featured')} /> Produto em destaque</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('isActive')} /> Produto ativo</label>
      </section>

      <section className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
        <div className="flex justify-between border-b pb-2"><h2 className="font-semibold">Variações e estoque</h2><button type="button" onClick={() => append({ name: '', sku: '', color: '', size: '', length: '', stockQuantity: 0, salePrice: null, lowStockThreshold: 5, isActive: true })} className="text-xs bg-slate-100 px-3 py-1.5 rounded-md flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Adicionar variação</button></div>
        <p className="text-xs text-slate-500">Ao remover uma variação usada em pedidos, ela será desativada e continuará disponível aqui para consulta.</p>
        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-lg border">
            <input type="hidden" {...register(`variants.${index}.id`)} />
            <Field label="Nome *" error={errors.variants?.[index]?.name?.message}><input {...register(`variants.${index}.name`)} maxLength={100} className={inputClass} /></Field>
            <Field label="SKU"><input value={field.sku || 'Gerado ao salvar'} readOnly className={`${inputClass} bg-slate-100 text-slate-500`} /></Field>
            <Field label="Código de barras" error={errors.variants?.[index]?.barcode?.message}><input {...register(`variants.${index}.barcode`)} maxLength={14} inputMode="numeric" className={inputClass} /></Field>
            <Field label="Cor"><input {...register(`variants.${index}.color`)} maxLength={50} className={inputClass} /></Field>
            <Field label="Tamanho"><input {...register(`variants.${index}.size`)} maxLength={50} className={inputClass} /></Field>
            <Field label="Comprimento"><input {...register(`variants.${index}.length`)} maxLength={50} className={inputClass} /></Field>
            <Field label={variants[index]?.id ? 'Estoque atual (use Controle de estoque)' : 'Saldo inicial'}><input type="number" min="0" step="0.01" readOnly={Boolean(variants[index]?.id)} {...register(`variants.${index}.stockQuantity`)} className={`${inputClass} ${variants[index]?.id ? 'bg-slate-100 text-slate-500' : ''}`} /></Field>
            <Field label="Preço de venda da variação"><input type="number" min="0.01" step="0.01" placeholder={`Usa R$ ${salePrice.toFixed(2)}`} {...register(`variants.${index}.salePrice`)} className={inputClass} /></Field>
            <Field label="Alerta de estoque"><input type="number" min="0" step="0.01" {...register(`variants.${index}.lowStockThreshold`)} className={inputClass} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register(`variants.${index}.isActive`)} /> Variação ativa</label>
            {fields.length > 1 && <button type="button" onClick={() => remove(index)} className="justify-self-start text-red-600 text-sm flex items-center gap-1"><Trash2 className="h-4 w-4" /> Remover</button>}
          </div>
        ))}
        {errors.variants?.message && <p className="text-red-600 text-xs">{errors.variants.message}</p>}
      </section>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-700 space-y-1"><span>{label}</span>{children}{error && <span className="block text-red-600 font-normal">{error}</span>}</label>;
}

function firstValidationMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  for (const child of Object.values(record)) {
    const message = firstValidationMessage(child);
    if (message) return message;
  }
  return undefined;
}
