import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveAuthorizedAdminAccess } from '@/lib/authorizedAdminAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  let access;
  try {
    access = await resolveAuthorizedAdminAccess(auth.session, {
      restaurantId: request.nextUrl.searchParams.get('restaurantId') ?? request.nextUrl.searchParams.get('restaurant_id'),
      tenantSlug: request.nextUrl.searchParams.get('tenant'),
    });
  } catch {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }
  try {
    const { data: links, error: linkError } = await supabaseAdmin.from('producto_restaurantes')
      .select('producto_id').eq('restaurant_id', access.restaurant!.id);
    if (linkError) throw linkError;
    if (!links?.length) return NextResponse.json([], { headers: { 'Cache-Control': 'private, no-store' } });
    const { data, error } = await supabaseAdmin
      .from('productos')
      .select('id, categoria, disponible')
      .in('id', links.map(link => link.producto_id))
      .order('categoria', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('GET /api/stats - error cargando productos:', error);

      return NextResponse.json(
        { error: 'No se pudieron cargar las estadísticas.' },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? [], { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('GET /api/stats - error inesperado:', error);

    return NextResponse.json(
      { error: 'Ocurrió un error inesperado al cargar las estadísticas.' },
      { status: 500 }
    );
  }
}
