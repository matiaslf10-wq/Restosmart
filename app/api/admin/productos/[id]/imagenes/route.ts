import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { resolveAuthorizedAdminAccess } from '@/lib/authorizedAdminAccess';
import { ownsProductInRestaurant } from '@/lib/adminProductAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };
async function authorize(request: NextRequest, params: Params['params']) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) return { response: auth.response };
  try {
    const access = await resolveAuthorizedAdminAccess(auth.session, {
      restaurantId: request.nextUrl.searchParams.get('restaurantId'),
      tenantSlug: request.nextUrl.searchParams.get('tenant'),
    });
    const id = Number((await params).id);
    if (!await ownsProductInRestaurant(id, access)) return { response: NextResponse.json({ error: 'Producto no disponible para esta sucursal.' }, { status: 404 }) };
    return { id };
  } catch {
    return { response: NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }) };
  }
}
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await authorize(request, params);
  if (auth.response) return auth.response;
  const { data, error } = await supabaseAdmin.from('producto_imagenes')
    .select('id, producto_id, image_url, storage_path, es_portada, orden')
    .eq('producto_id', auth.id).order('orden', { ascending: true }).order('id', { ascending: true });
  if (error) return NextResponse.json({ error: 'No se pudieron cargar las imágenes.' }, { status: 500 });
  return NextResponse.json(data ?? []);
}
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await authorize(request, params);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const { data: image, error } = await supabaseAdmin.from('producto_imagenes')
      .select('id, image_url').eq('producto_id', auth.id).eq('id', body.imageId).maybeSingle();
    if (error) throw error;
    if (!image) return NextResponse.json({ error: 'Imagen ajena o inexistente.' }, { status: 404 });
    // URL and ownership come from the stored row, never the client.
    const { error: productError } = await supabaseAdmin.from('productos').update({ imagen_url: image.image_url }).eq('id', auth.id);
    if (productError) throw productError;
    const { error: resetError } = await supabaseAdmin.from('producto_imagenes').update({ es_portada: false }).eq('producto_id', auth.id);
    if (resetError) throw resetError;
    const { error: coverError } = await supabaseAdmin.from('producto_imagenes').update({ es_portada: true }).eq('producto_id', auth.id).eq('id', image.id);
    if (coverError) throw coverError;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar la portada.' }, { status: 500 });
  }
}
// Legacy object paths do not establish tenant ownership. No Storage writes here.
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await authorize(request, params);
  return auth.response ?? NextResponse.json({ error: 'Subida de imágenes bloqueada: migración segura de Storage pendiente.' }, { status: 409 });
}
