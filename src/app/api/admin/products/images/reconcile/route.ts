import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';

function validCron(request: Request) {
  const expected = process.env.CRON_SECRET || '';
  const received = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  return expected.length >= 32 && received.length === expected.length
    && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

async function reconcile(request: Request) {
  const noStore = { 'Cache-Control': 'no-store' };
  if (!validCron(request)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401, headers: noStore });
  try {
    const supabase = createServiceClient();
    const { data: rows, error: rowsError } = await supabase.from('product_images').select('storage_path');
    if (rowsError) throw rowsError;
    const referenced = new Set((rows || []).map((row) => row.storage_path));
    const orphaned: string[] = [];
    const folders: { name: string }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: page, error: folderError } = await supabase.storage.from('product-images').list('products', { limit: 1000, offset });
      if (folderError) throw folderError;
      folders.push(...(page || []));
      if (!page || page.length < 1000) break;
    }
    for (const folder of folders) {
      const prefix = `products/${folder.name}`;
      const files: { name: string }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error } = await supabase.storage.from('product-images').list(prefix, { limit: 1000, offset });
        if (error) throw error;
        files.push(...(page || []));
        if (!page || page.length < 1000) break;
      }
      for (const file of files || []) {
        const path = `${prefix}/${file.name}`;
        if (/^products\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i.test(path) && !referenced.has(path)) orphaned.push(path);
      }
    }
    for (let index = 0; index < orphaned.length; index += 100) {
      const { error } = await supabase.storage.from('product-images').remove(orphaned.slice(index, index + 100));
      if (error) throw error;
    }
    return NextResponse.json({ referenced: referenced.size, orphaned: orphaned.length, removed: orphaned.length }, { headers: noStore });
  } catch (error) {
    console.error('Falha na reconciliação do Storage:', error);
    return NextResponse.json({ error: 'Falha na reconciliação' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: Request) { return reconcile(request); }
export async function GET(request: Request) { return reconcile(request); }
