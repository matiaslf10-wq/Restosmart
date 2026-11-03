import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { resolveAuthorizedAdminAccess } from '@/lib/authorizedAdminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
export const dynamic = 'force-dynamic';
async function access(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) return { response: auth.response };
  try {
    const resolved = await resolveAuthorizedAdminAccess(auth.session, { restaurantId: request.nextUrl.searchParams.get('restaurantId') });
    if (!resolved.restaurant?.id) throw new Error();
    return { id: resolved.restaurant.id };
  } catch { return { response: NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }) }; }
}
export async function GET(request: NextRequest) {
  const ctx = await access(request); if (ctx.response) return ctx.response;
  const result = await supabaseAdmin.from('configuracion_local').select('ready_notice_mode').eq('restaurant_id', ctx.id!).maybeSingle();
  return result.error ? NextResponse.json({ error: 'No se pudo cargar la opción.' }, { status: 503 }) : NextResponse.json({ mode: result.data?.ready_notice_mode ?? null }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(request: NextRequest) {
  const ctx = await access(request); if (ctx.response) return ctx.response;
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Origen denegado.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!['table_service','counter'].includes(body?.mode)) return NextResponse.json({ error: 'Elegí una opción válida.' }, { status: 400 });
  const result = await supabaseAdmin.from('configuracion_local').update({ ready_notice_mode: body.mode }).eq('restaurant_id', ctx.id!).select('restaurant_id').single();
  return result.error ? NextResponse.json({ error: 'No se pudo guardar la opción.' }, { status: 409 }) : NextResponse.json({ ok: true });
}
