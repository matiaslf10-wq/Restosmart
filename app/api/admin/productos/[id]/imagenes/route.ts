import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { resolveAuthorizedAdminAccess } from '@/lib/authorizedAdminAccess';
import { ownsProductInRestaurant } from '@/lib/adminProductAccess';
import { readAdminImage, adminImagePath, ImageInputError } from '@/lib/adminImageStorage';
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
    return { id, access };
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
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await authorize(request, params);
  if (auth.response) return auth.response;
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return NextResponse.json({ error: 'Use multipart.' }, { status: 409 });
  try {
    const image = await readAdminImage(request);
    const path = adminImagePath(auth.access!.tenantId, 'productos', auth.id!, image.ext);
    const bucket = supabaseAdmin.storage.from('productos');
    const { error: uploadError } = await bucket.upload(path, image.bytes, { contentType: image.mime, upsert: false });
    if (uploadError) throw uploadError;
    const url = bucket.getPublicUrl(path).data.publicUrl;
    const { data, error } = await supabaseAdmin.from('producto_imagenes').insert({ producto_id: auth.id, image_url: url, storage_path: path, es_portada: false, orden: null }).select('id, producto_id, image_url, storage_path, es_portada, orden').single();
    // An uncertain DB result may have committed: retain the object for reconciliation.
    if (error || !data) throw new Error('metadata');
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof ImageInputError ? error.message : 'No se pudo guardar la imagen. Recargue antes de reintentar.' }, { status: error instanceof ImageInputError ? 400 : 500 }); }
}
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await authorize(request, params);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    if (Object.keys(body).some(key => key !== 'imageId') || !Number.isSafeInteger(body.imageId)) return NextResponse.json({ error: 'Solo se admite imageId.' }, { status: 400 });
    const { data: image, error } = await supabaseAdmin.from('producto_imagenes').select('id, image_url').eq('producto_id', auth.id).eq('id', body.imageId).maybeSingle();
    if (error) throw error;
    if (!image) return NextResponse.json({ error: 'Imagen no disponible.' }, { status: 404 });
    const { error: coverError } = await supabaseAdmin.from('productos').update({ imagen_url: null }).eq('id', auth.id).eq('imagen_url', image.image_url);
    if (coverError) throw coverError;
    const { error: deleteError } = await supabaseAdmin.from('producto_imagenes').delete().eq('producto_id', auth.id).eq('id', image.id);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true, storageCleanup: 'deferred' });
  } catch { return NextResponse.json({ error: 'No se pudo quitar la imagen. Recargue para verificar el estado.' }, { status: 500 }); }
}
