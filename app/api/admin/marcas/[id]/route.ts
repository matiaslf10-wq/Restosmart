import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  getFallbackAdminAccess,
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
} from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

function assertCanUseMultiBrand(access: Awaited<ReturnType<typeof getFallbackAdminAccess>>) {
  return !!access.capabilities?.multi_brand;
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

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(request, auth.session);

  if (!assertCanUseMultiBrand(access)) {
    return NextResponse.json(
      { error: 'El add-on Multimarca no está activo para este local.' },
      { status: 403 }
    );
  }

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

  const payload = {
    nombre,
    descripcion: normalizeNullableString(body?.descripcion),
    logo_url: normalizeNullableString(body?.logo_url),
    color_hex: normalizeNullableString(body?.color_hex),
    activa: normalizeBoolean(body?.activa, true),
    orden: normalizeInteger(body?.orden, 0),
    actualizada_en: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabaseAdmin
      .from('marcas')
      .update(payload)
      .eq('id', id)
      .eq('tenant_id', access.tenantId)
      .select(
        'id, tenant_id, restaurant_id, slug, nombre, descripcion, logo_url, color_hex, activa, orden, creado_en, actualizada_en'
      )
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

  if (!assertCanUseMultiBrand(access)) {
    return NextResponse.json(
      { error: 'El add-on Multimarca no está activo para este local.' },
      { status: 403 }
    );
  }

  const { id } = await params;

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