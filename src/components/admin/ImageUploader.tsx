'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Upload, Trash2, Star, Loader2 } from 'lucide-react';

interface ProductImage { id: string; storage_path: string; storagePath?: string; is_primary: boolean }

export function ImageUploader({ productId, images: initialImages }: { productId: string; images: ProductImage[] }) {
  const [images, setImages] = useState(initialImages);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErrorMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/admin/products/${productId}/images`, { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha no upload da imagem.');
      setImages((current) => [
        ...current.map((image) => result.image.is_primary ? { ...image, is_primary: false } : image),
        result.image,
      ]);
      event.target.value = '';
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao enviar imagem.');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (image: ProductImage) => {
    if (!confirm('Tem certeza que deseja remover esta imagem?')) return;
    setErrorMessage('');
    try {
      const response = await fetch(`/api/admin/products/${productId}/images/${image.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao excluir imagem.');
      const remaining = images.filter((current) => current.id !== image.id);
      if (image.is_primary && remaining.length > 0) remaining[0] = { ...remaining[0], is_primary: true };
      setImages(remaining);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao excluir imagem.');
    }
  };

  const makePrimary = async (imageId: string) => {
    setErrorMessage('');
    try {
      const response = await fetch(`/api/admin/products/${productId}/images/${imageId}`, { method: 'PATCH' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao definir imagem principal.');
      setImages((current) => current.map((image) => ({ ...image, is_primary: image.id === imageId })));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao definir imagem principal.');
    }
  };

  return (
    <div className="space-y-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-5xl mx-auto">
      <h3 className="font-semibold text-slate-800 text-sm border-b pb-2">Galeria de imagens</h3>
      {errorMessage && <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">{errorMessage}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {images.map((image) => (
          <div key={image.id} className={`relative group rounded-lg overflow-hidden border-2 h-32 bg-slate-100 ${image.is_primary ? 'border-amber-500' : 'border-slate-200'}`}>
            <Image src={image.storage_path} alt="Imagem do produto" fill className="object-cover" />
            {image.is_primary && <span className="absolute top-1 left-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex"><Star className="h-3 w-3 fill-white mr-1" /> Principal</span>}
            <div className="absolute inset-0 bg-black/40 opacity-100 sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition flex items-center justify-center gap-2">
              {!image.is_primary && <button type="button" aria-label="Definir como principal" onClick={() => makePrimary(image.id)} className="p-2 bg-amber-500 text-white rounded-full" title="Definir como principal"><Star className="h-4 w-4" /></button>}
              <button type="button" aria-label="Remover imagem" onClick={() => remove(image)} className="p-2 bg-red-600 text-white rounded-full" title="Remover imagem"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        <label className="border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-lg h-32 flex flex-col items-center justify-center cursor-pointer bg-slate-50">
          {uploading ? <Loader2 className="h-6 w-6 text-amber-600 animate-spin" /> : <><Upload className="h-6 w-6 text-slate-400 mb-1" /><span className="text-xs font-semibold">Enviar imagem</span><span className="text-[10px] text-slate-400">Máx. 5 MB</span></>}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={uploading} className="hidden" />
        </label>
      </div>
    </div>
  );
}
