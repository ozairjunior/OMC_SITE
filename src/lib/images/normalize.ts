import 'server-only';

import sharp from 'sharp';

export async function normalizeProductImage(input: Buffer) {
  if (input.byteLength === 0 || input.byteLength > 5 * 1024 * 1024) throw new Error('IMAGE_SIZE');
  try {
    const image = sharp(input, { failOn: 'warning', limitInputPixels: 40_000_000, sequentialRead: true });
    const metadata = await image.metadata();
    // AVIF/HEIF depende de libheif; nao e necessario para este catalogo e fica
    // deliberadamente fora da superficie de decodificacao do servidor.
    if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp'].includes(metadata.format || '')) {
      throw new Error('IMAGE_FORMAT');
    }
    const buffer = await image.rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer();
    return { buffer, contentType: 'image/webp' as const, extension: 'webp' as const };
  } catch (error) {
    if (error instanceof Error && error.message === 'IMAGE_SIZE') throw error;
    throw new Error('IMAGE_INVALID');
  }
}
