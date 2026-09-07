import { z } from 'zod';

export function normalizeGtin(value: string) { return value.replace(/\D/g, ''); }
export function isSupportedBarcode(value: string) {
  return [8, 12, 13, 14].includes(normalizeGtin(value).length);
}

const optionalPositiveNumber = z.preprocess(
  (value) => value === '' || value === undefined || value === null ? null : value,
  z.coerce.number().finite().positive().nullable()
);
const optionalNonNegativeNumber = z.preprocess((value) => value === '' || value === undefined || value === null ? null : value, z.coerce.number().min(0).nullable());
const optionalUuid = z.preprocess(
  (value) => value === '' || value === null || value === undefined ? undefined : value,
  z.string().uuid().optional(),
);

export const unitTypeEnum = z.enum([
  'UN', 'KG', 'G', 'M', 'M2', 'M3', 'L', 'ML', 'CX', 'PCT', 'SC', 'RL', 'PAR', 'KIT'
]);

export const productVariantSchema = z.object({
  id: optionalUuid,
  name: z.string().min(1, 'Nome da variação é obrigatório').max(100),
  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().transform(normalizeGtin).refine((value) => value === '' || isSupportedBarcode(value), 'O código de barras deve ter 8, 12, 13 ou 14 dígitos').optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  length: z.string().max(50).optional().nullable(),
  salePrice: optionalPositiveNumber,
  stockQuantity: z.coerce.number().min(0, 'Estoque não pode ser negativo').default(0),
  lowStockThreshold: z.coerce.number().min(0).default(5),
  isActive: z.boolean().default(true),
});

export const productImageSchema = z.object({
  id: optionalUuid,
  storagePath: z.string().min(1, 'Caminho da imagem é obrigatório'),
  altText: z.string().max(150).optional().nullable(),
  displayOrder: z.number().int().default(0),
  isPrimary: z.boolean().default(false),
});

export const productSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid('Selecione uma categoria válida'),
  brandId: z.preprocess((value) => value === '' || value == null ? null : value, z.string().uuid('Selecione uma marca válida').nullable()),
  name: z.string().min(3, 'Nome do produto deve ter pelo menos 3 caracteres').max(150),
  slug: z.string().min(3).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens'),
  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().transform(normalizeGtin).refine((value) => value === '' || isSupportedBarcode(value), 'O código de barras deve ter 8, 12, 13 ou 14 dígitos').optional().nullable(),
  shortDescription: z.string().max(255).optional().nullable(),
  description: z.string().optional().nullable(),
  brand: z.string().max(80).optional().nullable(),
  unit: unitTypeEnum,
  price: z.coerce.number().positive('O preço deve ser maior que zero'),
  purchasePrice: optionalNonNegativeNumber,
  minimumQuantity: z.coerce.number().positive('Quantidade mínima deve ser maior que zero').default(1),
  stepQuantity: z.coerce.number().positive('Passo fracionado deve ser maior que zero').default(1),
  coveragePerPackage: optionalPositiveNumber,
  featured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  variants: z.array(productVariantSchema).min(1, 'Adicione pelo menos uma variação do produto'),
  images: z.array(productImageSchema).default([]),
  searchTerms: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
});

export type ProductInput = z.infer<typeof productSchema>;
export type ProductVariantInput = z.infer<typeof productVariantSchema>;
