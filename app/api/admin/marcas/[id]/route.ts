import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  getFallbackAdminAccess,
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
  type AdminAccessSnapshot,
} from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARCAS_SELECT =
  'id, tenant_id, restaurant_id, slug, nombre, descripcion, logo_url, color_hex, activa, orden, creado_en, actualizada_en';

const PRO_ACTIVE_BRANDS_LIMIT = 3;

type Params = {
  params: Promise<{ id: string }>;
};

type MarcaBody = {
  nombre?: string;
  descripcion?: string | null;
  logo_url?: string | null;
  color_hex?: string | null;
  activa?: boolean;
  orden?: number | string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeNonEmptyString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeNullableString(value: unknown): string | null {
  return normalizeNonEmptyString(value);
}

function normalizeBoolean(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return fallback;
}

function normalizeInteger(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeNonEmptyString(value);
    if (normalized) return normalized;
  }

  return null;
}

function extractRequestedTenantContext(
  request: NextRequest,
  session: unknown
): AdminAccessResolutionOptions {
  const sessionRecord = asRecord(session);
  const restaurantRecord = asRecord(sessionRecord?.restaurant);

  const tenantSlug = pickFirstString(
    request.nextUrl.searchParams.get('tenant'),
    request.nextUrl.searchParams.get('tenantSlug'),
    request.nextUrl.searchParams.get('slug'),
    request.headers.get('x-tenant-id'),
    request.headers.get('x-tenant-slug'),
    request.cookies.get('tenant')?.value,
    request.cookies.get('tenant_slug')?.value,
    restaurantRecord?.slug,
    sessionRecord?.tenantId,
    sessionRecord?.tenant_id,
    sessionRecord?.slug
  );

  const restaurantId = pickFirstString(
    request.nextUrl.searchParams.get('restaurantId'),
    request.nextUrl.searchParams.get('restaurant_id'),
    request.headers.get('x-restaurant-id'),
    request.cookies.get('restaurant_id')?.value,
    restaurantRecord?.id,
    sessionRecord?.restaurantId,
    sessionRecord?.restaurant_id
  );

  return {
    tenantSlug,
    restaurantId,
  };
}

async function resolveAccessForRequest(request: NextRequest, session: unknown) {
  const requestedContext = extractRequestedTenantContext(request, session);

  try {
    return await resolveAdminAccess(requestedContext);
  } catch (error) {
    console.error('Marca access resolution error:', error);
    return getFallbackAdminAccess();
  }
}

function canUseMultiBrand(access: AdminAccessSnapshot) {
  const accessRecord = asRecord(access);
  const addonsRecord = asRecord(accessRecord?.addons);

  return (
    !!access.capabilities?.multi_brand ||
    addonsRecord?.multi_brand === true
  );
}

function validateMultiBrandAccess(access: AdminAccessSnapshot) {
  if (!canUseMultiBrand(access)) {
    return NextResponse.json(
      { error: 'El add-on Multimarca no está activo para este local.' },
      { status: 403 }
    );
  }

  if (access.plan === 'esencial') {
    return NextResponse.json(
      { error: 'Multimarca está disponible desde el plan Pro.' },
      { status: 409 }
    );
  }

  return null;
}

async function countProductosByMarcaId(marcaId: string) {
  const { count, error } = await supabaseAdmin
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('marca_id', marcaId);

  if (error) {
    console.error('No se pudo contar productos de marca:', error);
    return 0;
  }

  return count ?? 0;
}

function isMarcaPrincipalName(value: unknown) {
  return String(value ?? '').trim().toLowerCase() === 'marca principal';
}

async function getMarcaById(id: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('marcas')
    .select('id, nombre, activa')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function countActiveBrandsExcluding(tenantId: string, excludedId: string) {
  const { count, error } = await supabaseAdmin
    .from('marcas')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('activa', true)
    .neq('id', excludedId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(request, auth.session);

  const accessError = validateMultiBrandAccess(access);
if (accessError) return accessError;

  const { id } = await params;

  let body: MarcaBody | null = null;

  try {
    body = (await request.json()) as MarcaBody;
  } catch {
    body = null;
  }

  const nombre = normalizeNonEmptyString(body?.nombre);

if (!nombre) {
  return NextResponse.json(
    { error: 'El nombre de la marca es obligatorio.' },
    { status: 400 }
  );
}

const marcaActual = await getMarcaById(id, access.tenantId);

if (!marcaActual) {
  return NextResponse.json(
    { error: 'Marca no encontrada.' },
    { status: 404 }
  );
}

const esMarcaPrincipal = isMarcaPrincipalName(marcaActual.nombre);
const activa = normalizeBoolean(body?.activa, true);

if (esMarcaPrincipal && !isMarcaPrincipalName(nombre)) {
  return NextResponse.json(
    { error: 'La Marca principal no se puede renombrar.' },
    { status: 409 }
  );
}

if (esMarcaPrincipal && activa === false) {
  return NextResponse.json(
    { error: 'La Marca principal no se puede desactivar.' },
    { status: 409 }
  );
}

if (access.plan === 'pro' && activa) {
  const activeBrandsExcludingCurrent = await countActiveBrandsExcluding(
    access.tenantId,
    id
  );

  if (activeBrandsExcludingCurrent >= PRO_ACTIVE_BRANDS_LIMIT) {
    return NextResponse.json(
      {
        error:
          'El add-on Multimarca en Pro permite hasta 3 marcas activas. Para marcas ilimitadas, usá Intelligence.',
      },
      { status: 409 }
    );
  }
}

const payload = {
  nombre: esMarcaPrincipal ? 'Marca principal' : nombre,
  descripcion: normalizeNullableString(body?.descripcion),
  logo_url: normalizeNullableString(body?.logo_url),
  color_hex: normalizeNullableString(body?.color_hex),
  activa,
  orden: normalizeInteger(body?.orden, 0),
  actualizada_en: new Date().toISOString(),
};

  try {
    const { data, error } = await supabaseAdmin
      .from('marcas')
      .update(payload)
      .eq('id', id)
      .eq('tenant_id', access.tenantId)
      .select(MARCAS_SELECT)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: 'Marca no encontrada.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, marca: data });
  } catch (error) {
    console.error('PUT /api/admin/marcas/[id] error:', error);
    return NextResponse.json(
      { error: 'No se pudo actualizar la marca.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(request, auth.session);

  const accessError = validateMultiBrandAccess(access);
if (accessError) return accessError;

  const { id } = await params;

  const marcaActual = await getMarcaById(id, access.tenantId);

if (!marcaActual) {
  return NextResponse.json(
    { error: 'Marca no encontrada.' },
    { status: 404 }
  );
}

if (isMarcaPrincipalName(marcaActual.nombre)) {
  return NextResponse.json(
    { error: 'La Marca principal no se puede eliminar.' },
    { status: 409 }
  );
}

  try {
    const productosAsignados = await countProductosByMarcaId(id);

    if (productosAsignados > 0) {
      return NextResponse.json(
        {
          error:
            'No se puede eliminar una marca con productos asignados. Primero reasigná esos productos o desactivá la marca.',
        },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('marcas')
      .delete()
      .eq('id', id)
      .eq('tenant_id', access.tenantId)
      .select('id')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: 'Marca no encontrada.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (error) {
    console.error('DELETE /api/admin/marcas/[id] error:', error);
    return NextResponse.json(
      { error: 'No se pudo eliminar la marca.' },
      { status: 500 }
    );
  }
}