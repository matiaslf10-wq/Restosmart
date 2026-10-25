import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { resolveAuthorizedAdminAccess } from '@/lib/authorizedAdminAccess';
import { readAdminImage, adminImagePath, ImageInputError } from '@/lib/adminImageStorage';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Params) {
  const session = requireAdminAuth(request);
  if (!session.ok) return session.response;
  let access;
  try { access = await resolveAuthorizedAdminAccess(session.session, { restaurantId: request.nextUrl.searchParams.get('restaurantId'), tenantSlug: request.nextUrl.searchParams.get('tenant') }); }
  catch { return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }); }
  if ((!access.capabilities?.multi_brand && !access.addons?.multi_brand) || access.plan === 'esencial') return NextResponse.json({ error: 'Multimarca no disponible.' }, { status: 403 });
  const { id } = await params;
  const { data: brand, error: lookupError } = await supabaseAdmin.from('marcas').select('id').eq('id', id).eq('tenant_id', access.tenantId).maybeSingle();
  if (lookupError || !brand) return NextResponse.json({ error: 'Marca no disponible.' }, { status: 404 });
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return NextResponse.json({ error: 'Use multipart.' }, { status: 409 });
  try {
    const image = await readAdminImage(request);
    const path = adminImagePath(access.tenantId, 'marcas', id, image.ext);
    const bucket = supabaseAdmin.storage.from('productos');
    const { error: uploadError } = await bucket.upload(path, image.bytes, { contentType: image.mime, upsert: false });
    if (uploadError) throw uploadError;
    const url = bucket.getPublicUrl(path).data.publicUrl;
    const { data, error } = await supabaseAdmin.from('marcas').update({ logo_url: url }).eq('id', id).eq('tenant_id', access.tenantId).select('id').maybeSingle();
    // An uncertain DB result may have committed: retain the object for reconciliation.
    if (error || !data) throw new Error('metadata');
    return NextResponse.json({ ok: true, logo_url: url }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof ImageInputError ? error.message : 'No se pudo guardar la imagen. Recargue antes de reintentar.' }, { status: error instanceof ImageInputError ? 400 : 500 }); }
}
