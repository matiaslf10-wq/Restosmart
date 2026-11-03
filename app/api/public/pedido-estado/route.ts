import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyOrderTrackingToken } from '@/lib/orderTracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, private' };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const restaurantId = typeof body?.restaurantId === 'string' ? body.restaurantId : '';
    const scope = verifyOrderTrackingToken(body?.token, restaurantId);
    if (!scope) return NextResponse.json({ error: 'Seguimiento no disponible.' }, { status: 404, headers });
    const { data, error } = await supabaseAdmin.from('pedidos')
      .select('id, estado, codigo_publico')
      .eq('id', scope.orderId).eq('restaurant_id', scope.restaurantId).maybeSingle();
    if (error) return NextResponse.json({ error: 'No se pudo actualizar el seguimiento.' }, { status: 503, headers });
    if (!data) return NextResponse.json({ error: 'Seguimiento no disponible.' }, { status: 404, headers });
    const config = await supabaseAdmin.from('configuracion_local').select('ready_notice_mode').eq('restaurant_id', scope.restaurantId).maybeSingle();
    const readyMessage = config.data?.ready_notice_mode === 'table_service'
      ? 'En breve lo llevamos a tu mesa.'
      : config.data?.ready_notice_mode === 'counter' ? 'Podés pasar por mostrador para retirarlo.' : 'Consultá al personal del local.';
    return NextResponse.json({ pedido: data, ready_message: readyMessage }, { headers });
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar el seguimiento.' }, { status: 503, headers });
  }
}
