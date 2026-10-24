import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { resolveAuthorizedAdminAccess } from '@/lib/authorizedAdminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
const active = ['solicitado', 'pendiente', 'en_preparacion', 'listo'];
async function accessFor(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) return auth;
  try {
    const access = await resolveAuthorizedAdminAccess(auth.session, {
      restaurantId: request.nextUrl.searchParams.get('restaurantId') ?? request.nextUrl.searchParams.get('restaurant_id'),
    });
    if (!access.restaurant?.id) throw new Error('Denied');
    return { ok: true as const, restaurantId: access.restaurant.id };
  } catch {
    return { ok: false as const, response: NextResponse.json({ error: 'Acceso al restaurante denegado.' }, { status: 403 }) };
  }
}
export async function GET(request: NextRequest) {
  const access = await accessFor(request);
  if (!access.ok) return access.response;
  const { data, error } = await supabaseAdmin.from('pedidos')
    .select(`id, restaurant_id, mesa_id, creado_en, estado, paga_efectivo,
      forma_pago, origen, tipo_servicio, medio_pago, estado_pago, efectivo_aprobado, pasado_a_caja,
      items_pedido(id, cantidad, comentarios, producto:productos(nombre, precio))`)
    .eq('restaurant_id', access.restaurantId).in('estado', active).order('creado_en', { ascending: true });
  if (error) return NextResponse.json({ error: 'No se pudieron cargar los pedidos.' }, { status: 500 });
  return NextResponse.json({ pedidos: data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(request: NextRequest) {
  const access = await accessFor(request);
  if (!access.ok) return access.response;
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const body = await request.json();
    const ids: unknown[] = Array.isArray(body.pedidoIds) ? body.pedidoIds : [body.pedidoId];
    if (!ids.length || ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || Number(id) <= 0)) return NextResponse.json({ error: 'Pedidos inválidos.' }, { status: 400 });
    const action = body.action;
    if (!['estado', 'caja', 'cerrar', 'enviar_cocina', 'cocina'].includes(action) ||
      (action === 'estado' && !['pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado'].includes(body.estado)) ||
      (action === 'cocina' && !['en_preparacion', 'listo'].includes(body.estado)) ||
      (['cocina', 'enviar_cocina'].includes(action) && ids.length !== 1)) return NextResponse.json({ error: 'Operación inválida.' }, { status: 400 });
    const { data: orders, error: readError } = await supabaseAdmin.from('pedidos').select('id, estado')
      .eq('restaurant_id', access.restaurantId).in('id', ids).in('estado', active);
    if (readError) throw readError;
    if (!orders || orders.length !== new Set(ids).size) return NextResponse.json({ error: 'Pedido no disponible en esta sucursal.' }, { status: 409 });
    if (action === 'cocina' || action === 'enviar_cocina') {
      const { data: items, error } = await supabaseAdmin.from('items_pedido').select('id, comentarios').eq('pedido_id', ids[0]);
      if (error) throw error;
      if (body.itemId != null && !items?.some(item => item.id === body.itemId)) return NextResponse.json({ error: 'Ítem no disponible en este pedido.' }, { status: 409 });
      for (const item of items ?? []) {
        if (body.itemId != null && item.id !== body.itemId) continue;
        const raw = String(item.comentarios ?? '');
        const match = raw.match(/^\[\[COCINA:(pendiente|en_preparacion|listo)\]\]\s*([\s\S]*)$/i);
        if (action === 'enviar_cocina' && match) continue;
        if (action === 'cocina' && (!match || match[1] === 'listo' || (body.estado === 'en_preparacion' && match[1] !== 'pendiente'))) continue;
        const state = action === 'enviar_cocina' ? 'pendiente' : body.estado;
        const comment = match ? match[2] : raw;
        let update = supabaseAdmin.from('items_pedido').update({ comentarios: `[[COCINA:${state}]]${comment ? ` ${comment}` : ''}` }).eq('id', item.id).eq('pedido_id', ids[0]);
        update = item.comentarios === null ? update.is('comentarios', null) : update.eq('comentarios', item.comentarios);
        const result = await update.select('id');
        if (result.error) throw result.error;
        if (!result.data?.length) return NextResponse.json({ error: 'El ítem cambió. Actualizá y reintentá.' }, { status: 409 });
      }
    }
    const payload = action === 'caja' ? { pasado_a_caja: true } : action === 'cerrar' ? { estado: 'cerrado', pasado_a_caja: false } : { estado: action === 'enviar_cocina' ? 'en_preparacion' : body.estado };
    const result = await supabaseAdmin.from('pedidos').update(payload).eq('restaurant_id', access.restaurantId).in('id', ids).in('estado', active).select('id');
    if (result.error) throw result.error;
    if (result.data?.length !== new Set(ids).size) return NextResponse.json({ error: 'Los pedidos cambiaron. Actualizá la pantalla.' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'No se pudo completar la operación. Actualizá antes de reintentar.' }, { status: 500 });
  }
}
