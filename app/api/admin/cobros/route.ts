import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { resolveAuthorizedAdminAccess } from '@/lib/authorizedAdminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { validateConfig } from '@/lib/cobros/model';
import { readCollectionConfig } from '@/lib/cobros/server';
export const dynamic = 'force-dynamic';

async function context(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) return { response: auth.response };
  try {
    const access = await resolveAuthorizedAdminAccess(auth.session, {
      restaurantId: request.nextUrl.searchParams.get('restaurantId') ?? request.nextUrl.searchParams.get('restaurant_id'),
      tenantSlug: request.nextUrl.searchParams.get('restaurant') ?? request.nextUrl.searchParams.get('tenant'),
    });
    if (!access.restaurant) throw new Error();
    return { tenant: access.tenantId, restaurant: access.restaurant.id, operator: `${auth.session.adminId}:${auth.session.email}` };
  } catch { return { response: NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }) }; }
}
export async function GET(request: NextRequest) {
  const ctx = await context(request); if (ctx.response) return ctx.response;
  try {
    const config = await readCollectionConfig(ctx.tenant!, ctx.restaurant!);
    const [payments, events] = await Promise.all([
      supabaseAdmin.from('order_collections').select('order_id,method,amount,currency,state,require_payment,created_at,updated_at').eq('tenant_id', ctx.tenant!).eq('restaurant_id', ctx.restaurant!).order('created_at', { ascending: false }).limit(100),
      supabaseAdmin.from('order_collection_events').select('id,order_id,action,operator,note,created_at').eq('tenant_id', ctx.tenant!).eq('restaurant_id', ctx.restaurant!).order('created_at', { ascending: false }).limit(200),
    ]);
    if (payments.error || events.error) throw new Error();
    return NextResponse.json({ ...config, payments: payments.data, events: events.data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Cobros no disponible. Verificá la migración B7.24.' }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const ctx = await context(request); if (ctx.response) return ctx.response;
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Origen denegado.' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  if (body.action === 'config') {
    let config;
    try { config = body.inherit === true && body.scope === 'branch' ? null : validateConfig(body.config); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Configuración inválida.' }, { status: 400 }); }
    if (!['tenant', 'branch'].includes(body.scope)) return NextResponse.json({ error: 'Ámbito inválido.' }, { status: 400 });
    const result = await supabaseAdmin.rpc('restosmart_collection_config_v1', { p_tenant: ctx.tenant, p_restaurant: ctx.restaurant, p_scope: body.scope === 'tenant' ? 'tenant' : `restaurant:${ctx.restaurant}`, p_config: config, p_operator: ctx.operator });
    return result.error ? NextResponse.json({ error: 'No se pudo guardar la configuración.' }, { status: 409 }) : NextResponse.json({ ok: true });
  }
  if (!['confirm', 'incident'].includes(body.action) || !Number.isSafeInteger(body.orderId) || body.orderId <= 0 || (body.action === 'incident' && (typeof body.note !== 'string' || !body.note.trim()))) return NextResponse.json({ error: 'Operación inválida.' }, { status: 400 });
  const result = await supabaseAdmin.rpc('restosmart_collection_action_v1', { p_tenant: ctx.tenant, p_restaurant: ctx.restaurant, p_order: body.orderId, p_token: null, p_action: body.action, p_operator: ctx.operator, p_note: typeof body.note === 'string' ? body.note.slice(0, 1000) : null });
  return result.error ? NextResponse.json({ error: 'El pago no está disponible o ya fue resuelto. Actualizá la pantalla.' }, { status: 409 }) : NextResponse.json({ ok: true });
}
