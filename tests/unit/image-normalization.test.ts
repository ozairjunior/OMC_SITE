import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));
import { normalizeProductImage } from '@/lib/images/normalize';

describe('normalização de imagens de produto', () => {
  it('decodifica os bytes e sempre gera WebP sem metadados do arquivo original', async () => {
    const input = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ff0000' } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await normalizeProductImage(input);
    const metadata = await sharp(result.buffer).metadata();
    expect(result).toMatchObject({ contentType: 'image/webp', extension: 'webp' });
    expect(metadata).toMatchObject({ format: 'webp', width: 10, height: 20 });
    expect(metadata.exif).toBeUndefined();
  });

  it('rejeita conteúdo arbitrário mesmo que o endpoint receba MIME de imagem', async () => {
    await expect(normalizeProductImage(Buffer.from('<script>alert(1)</script>'))).rejects.toThrow('IMAGE_INVALID');
  });

  it('rejeita entrada acima do limite antes de decodificar', async () => {
    await expect(normalizeProductImage(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow('IMAGE_SIZE');
  });
});
