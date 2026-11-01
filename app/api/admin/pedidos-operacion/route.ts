import { rpcResponse, authorityArgs, positiveId } from '@/lib/atomicContract';
import { maskBlockedKitchen } from '@/lib/cobros/kitchen';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { resolveAuthorizedAdminAccess } from '@/lib/authorizedAdminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
const active = ['solicitado', 'pendiente', 'en_preparacion', 'listo'];
function requestOrigin(request: NextRequest) {
  // NextURL normalizes 127.0.0.1 to localhost. Recover only the exact authority
  // of the opted-in loopback lab, never an alias supplied by Origin/Forwarded.
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development' &&
    !process.env.VERCEL && !process.env.CI &&
    process.env.RESTOSMART_KITCHEN_B751F_LAB === 'B751F_LOOPBACK_RPC_LAB_ONLY' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === 'http://127.0.0.1:54321' &&
    request.nextUrl.origin === 'http://localhost:3000' &&
    request.headers.get('host') === '127.0.0.1:3000') {
    return 'http://127.0.0.1:3000';
  }
  return request.nextUrl.origin;
}
async function accessFor(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) return auth;
  try {
    const access = await resolveAuthorizedAdminAccess(auth.session, {
      restaurantId: request.nextUrl.searchParams.get('restaurantId') ?? request.nextUrl.searchParams.get('restaurant_id'),
    });
    if (!access.restaurant?.id) throw new Error('Denied');
    return { ok: true as const, restaurantId: access.restaurant.id, authority: access.authority };
  } catch {
    return { ok: false as const, response: NextResponse.json({ error: 'Acceso al restaurante denegado.' }, { status: 403 }) };
  }
}
export async function GET(request: NextRequest) {
  const access = await accessFor(request);
  if (!access.ok) return access.response;
  const numero = request.nextUrl.searchParams.get('mesaNumero');
  let mesaId: number | undefined;
  if (numero !== null) {
    if (!Number.isSafeInteger(Number(numero)) || Number(numero) <= 0) return NextResponse.json({ error: 'Mesa inválida.' }, { status: 400 });
    const mesa = await supabaseAdmin.from('mesas').select('id')
      .eq('restaurant_id', access.restaurantId).eq('numero', Number(numero)).gt('id', 0).maybeSingle();
    if (mesa.error) return NextResponse.json({ error: 'No se pudo verificar la mesa.' }, { status: 500 });
    if (!mesa.data) return NextResponse.json({ error: 'Mesa no disponible.' }, { status: 404 });
    mesaId = mesa.data.id;
  }
  let query = supabaseAdmin.from('pedidos')
    .select(`id, restaurant_id, mesa_id, creado_en, estado, total, paga_efectivo,
      forma_pago, origen, tipo_servicio, medio_pago, estado_pago, efectivo_aprobado, pasado_a_caja,
      items_pedido(id, cantidad, comentarios, producto:productos(nombre, precio))`)
    .eq('restaurant_id', access.restaurantId).in('estado', active).order('creado_en', { ascending: true });
  if (mesaId !== undefined) query = query.eq('mesa_id', mesaId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'No se pudieron cargar los pedidos.' }, { status: 500 });
  try {
    return NextResponse.json({ pedidos: await maskBlockedKitchen(data ?? [], access.restaurantId) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'No se pudo verificar la política de cocina.' }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const access = await accessFor(request);
  if (!access.ok) return access.response;
  const origin = request.headers.get('origin');
  if (origin && origin !== requestOrigin(request))
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  const ids: unknown[] = Array.isArray(body.pedidoIds) ? body.pedidoIds : [body.pedidoId];
  if (!ids.length || ids.length > 100 || ids.some(id => !positiveId(id)) || new Set(ids).size !== ids.length ||
      (body.itemId != null && !positiveId(body.itemId))) return NextResponse.json({ error: 'Identificadores inválidos.' }, { status: 400 });
  if (!['estado', 'caja', 'cerrar', 'enviar_cocina', 'cocina'].includes(body.action) ||
      (body.action === 'estado' && !['pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado'].includes(body.estado)) ||
      (body.action === 'cocina' && !['en_preparacion', 'listo'].includes(body.estado)) ||
      (['cocina','enviar_cocina'].includes(body.action) && ids.length !== 1)) return NextResponse.json({ error: 'Operación inválida.' }, { status: 400 });
  try {
    const orders = await supabaseAdmin.from('pedidos').select('id, estado')
      .eq('restaurant_id', access.restaurantId).in('id', ids).in('estado', active);
    if (orders.error) return NextResponse.json({ error: 'No se pudo completar la operación. Actualizá antes de reintentar.' }, { status: 500 });
    if (!orders.data || orders.data.length !== ids.length) return NextResponse.json({ error: 'Pedido no disponible en esta sucursal.' }, { status: 409 });
    if (orders.data.some(order => !positiveId(order.id) || !ids.includes(order.id) || !active.includes(order.estado)) ||
        new Set(orders.data.map(order => order.id)).size !== ids.length)
      return NextResponse.json({ error: 'Snapshot no disponible.' }, { status: 503 });
    if (!['cocina', 'enviar_cocina'].includes(body.action)) {
      const result = await supabaseAdmin.rpc('restosmart_orders_b762l_v1', {
        ...authorityArgs(access.authority, access.restaurantId), p_action: body.action,
        p_estado: body.action === 'estado' ? body.estado : null,
        p_expected_orders: orders.data.map(order => ({ id: order.id, estado: order.estado })),
      });
      return rpcResponse(result.data, result.error);
    }
    const items = await supabaseAdmin.from('items_pedido').select('id,comentarios').eq('pedido_id', ids[0]);
    if (items.error) return rpcResponse(null, items.error);
    if (!items.data || items.data.some(item => !positiveId(item.id) || (item.comentarios !== null && typeof item.comentarios !== 'string')) ||
        new Set(items.data.map(item => item.id)).size !== items.data.length) return NextResponse.json({ error: 'Snapshot no disponible.' }, { status: 503 });
    if (body.itemId != null && !items.data.some(item => item.id === body.itemId)) return NextResponse.json({ error: 'Ítem no disponible.' }, { status: 409 });
    const result = await supabaseAdmin.rpc('restosmart_kitchen_b762l_v1', {
      ...authorityArgs(access.authority, access.restaurantId), p_pedido_id: ids[0],
      p_expected_estado: orders.data[0].estado, p_expected_items: items.data.map(item => ({ id: item.id, comentarios: item.comentarios })),
      p_action: body.action, p_estado: body.action === 'enviar_cocina' ? null : body.estado, p_item_id: body.itemId ?? null,
    });
    return rpcResponse(result.data, result.error);
  } catch { return rpcResponse(null, { code: 'TRANSPORT_UNKNOWN', message: '' }); }
}
