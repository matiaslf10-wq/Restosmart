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
    console.error('Marcas access resolution error:', error);
    return getFallbackAdminAccess();
  }
}

function assertCanUseMultiBrand(access: Awaited<ReturnType<typeof getFallbackAdminAccess>>) {
  return !!access.capabilities?.multi_brand;
}

async function ensureDefaultMarca(access: Awaited<ReturnType<typeof getFallbackAdminAccess>>) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('marcas')
    .select('id')
    .eq('tenant_id', access.tenantId)
    .order('orden', { ascending: true })
    .order('creado_en', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error('No se pudo verificar marca principal:', existingError);
    return;
  }

  if (existing?.id) return;

  const { error: insertError } = await supabaseAdmin.from('marcas').insert([
    {
      tenant_id: access.tenantId,
      restaurant_id: access.restaurant?.id ?? null,
      slug: access.restaurant?.slug ?? access.tenantId,
      nombre: 'Marca principal',
      descripcion: 'Marca principal del local',
      activa: true,
      orden: 0,
    },
  ]);

  if (insertError) {
    console.error('No se pudo crear marca principal:', insertError);
  }
}

export async function GET(request: NextRequest) {
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

  try {
    await ensureDefaultMarca(access);

    const { data, error } = await supabaseAdmin
      .from('marcas')
      .select(
        'id, tenant_id, restaurant_id, slug, nombre, descripcion, logo_url, color_hex, activa, orden, creado_en, actualizada_en'
      )
      .eq('tenant_id', access.tenantId)
      .order('activa', { ascending: false })
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      tenantId: access.tenantId,
      marcas: data ?? [],
    });
  } catch (error) {
    console.error('GET /api/admin/marcas error:', error);
    return NextResponse.json(
      { error: 'No se pudieron cargar las marcas.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
    tenant_id: access.tenantId,
    restaurant_id: access.restaurant?.id ?? null,
    slug: access.restaurant?.slug ?? access.tenantId,
    nombre,
    descripcion: normalizeNullableString(body?.descripcion),
    logo_url: normalizeNullableString(body?.logo_url),
    color_hex: normalizeNullableString(body?.color_hex),
    activa: normalizeBoolean(body?.activa, true),
    orden: normalizeInteger(body?.orden, 0),
  };

  try {
    const { data, error } = await supabaseAdmin
      .from('marcas')
      .insert([payload])
      .select(
        'id, tenant_id, restaurant_id, slug, nombre, descripcion, logo_url, color_hex, activa, orden, creado_en, actualizada_en'
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, marca: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/marcas error:', error);
    return NextResponse.json(
      { error: 'No se pudo crear la marca.' },
      { status: 500 }
    );
  }
}