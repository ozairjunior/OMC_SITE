type DatabaseError = { code?: string; message?: string; details?: string; hint?: string } | null;

export function productConflictMessage(error: DatabaseError) {
  if (error?.code !== '23505') return null;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ').toLowerCase();

  if (text.includes('name_normalized') || text.includes('(name)')) {
    return 'Já existe um produto cadastrado com esse nome.';
  }
  if (text.includes('barcode') || text.includes('gtin')) {
    return 'Este código de barras já está cadastrado em outro produto ou variação.';
  }
  if (text.includes('sku')) {
    return 'Este código/SKU já está cadastrado em outro produto ou variação.';
  }
  if (text.includes('slug')) {
    return 'A URL deste produto já está sendo utilizada por outro produto.';
  }
  return 'Já existe outro cadastro utilizando um destes identificadores.';
}
