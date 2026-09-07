import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';

const clickSchema = z.object({
  trackingToken: z.string().min(32).max(200),
  sessionId: z.string().max(100).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
    }
    const validation = clickSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Token de rastreamento inválido' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('mark_order_whatsapp_clicked', {
      p_order_id: id,
      p_tracking_token: validation.data.trackingToken,
      p_session_id: validation.data.sessionId || 'checkout',
    });

    if (error) return NextResponse.json({ error: 'Erro ao atualizar pedido' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Pedido ou token não encontrado' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao registrar clique no WhatsApp:', error);
    return NextResponse.json({ error: 'Erro no servidor' }, { status: 500 });
  }
}
