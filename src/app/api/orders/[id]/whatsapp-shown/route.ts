import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';

const eventSchema = z.object({ trackingToken: z.string().length(64), sessionId: z.string().max(100).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const validation = eventSchema.safeParse(await request.json());
    if (!z.string().uuid().safeParse(id).success || !validation.success) {
      return NextResponse.json({ error: 'Evento inválido' }, { status: 400 });
    }
    const { data, error } = await createServiceClient().rpc('mark_order_whatsapp_link_shown', {
      p_order_id: id, p_tracking_token: validation.data.trackingToken,
      p_session_id: validation.data.sessionId || 'checkout',
    });
    if (error) return NextResponse.json({ error: 'Erro ao registrar evento' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Pedido ou token não encontrado' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao registrar exibição do link do WhatsApp:', error);
    return NextResponse.json({ error: 'Erro no servidor' }, { status: 500 });
  }
}
