import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { readCollectionConfig } from '@/lib/cobros/server';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('restaurantId');
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'Sucursal requerida.' }, { status: 400 });
  try {
    const { data, error } = await supabaseAdmin.from('restaurants').select('id,owner_tenant_id,estado').eq('id', id).maybeSingle();
    if (error || !data || ['cerrado', 'pausado'].includes(data.estado)) return NextResponse.json({ error: 'Sucursal no disponible.' }, { status: 404 });
    const config = await readCollectionConfig(data.owner_tenant_id, String(data.id));
    // No payment account is invented for unconfigured restaurants.
    return NextResponse.json({ config: config.effective }, { headers });
  } catch { return NextResponse.json({ error: 'No se pudieron cargar los medios de cobro.' }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Origen denegado.' }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.token !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.token)) return NextResponse.json({ error: 'Declaración inválida.' }, { status: 400 });
    // The random capability is delivered only in the order creation response.
    // No browser order/tenant/branch/amount is used to authorize this operation.
    const { data, error } = await supabaseAdmin.from('order_collections').select('order_id,tenant_id,restaurant_id').eq('token', body.token).maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'Pago no disponible.' }, { status: 404 });
    const result = await supabaseAdmin.rpc('restosmart_collection_action_v1', { p_tenant: data.tenant_id, p_restaurant: data.restaurant_id, p_order: data.order_id, p_token: body.token, p_action: 'declare', p_operator: 'customer', p_note: null });
    if (result.error) return NextResponse.json({ error: 'La declaración ya fue registrada o el pago fue resuelto.' }, { status: 409 });
    return NextResponse.json({ state: 'declared', message: 'Pendiente de verificación por el comercio.' }, { headers });
  } catch { return NextResponse.json({ error: 'No se pudo registrar la declaración.' }, { status: 400 }); }
}
