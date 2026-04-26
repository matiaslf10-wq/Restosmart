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

const MARCAS_SELECT = `
  id,
  tenant_id,
  restaurant_id,
  slug,
  nombre,
  descripcion,
  logo_url,
  color_hex,
  activa,
  orden,
  creado_en,
  actualizada_en
`;

const PRO_ACTIVE_BRANDS_LIMIT = 3;

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

async function resolveAccessForRequest(
  request: NextRequest,
  session: unknown
): Promise<AdminAccessSnapshot> {
  const requestedContext = extractRequestedTenantContext(request, session);

  try {
    return await resolveAdminAccess(requestedContext);
  } catch (error) {
    console.error('Marcas access resolution error:', error);
    return getFallbackAdminAccess();
  }
}

function canUseMultiBrand(access: AdminAccessSnapshot) {
  return !!access.capabilities?.multi_brand;
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

async function ensureDefaultMarca(access: AdminAccessSnapshot) {
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

async function countActiveBrands(tenantId: string) {
  const { count, error } = await supabaseAdmin
    .from('marcas')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('activa', true);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function validateBrandLimitForCreate(
  access: AdminAccessSnapshot,
  requestedActive: boolean
) {
  if (!requestedActive) return null;

  if (access.plan !== 'pro') return null;

  const activeBrandsCount = await countActiveBrands(access.tenantId);

  if (activeBrandsCount >= PRO_ACTIVE_BRANDS_LIMIT) {
    return NextResponse.json(
      {
        error:
          'El add-on Multimarca en Pro permite hasta 3 marcas activas. Para marcas ilimitadas, usá Intelligence.',
      },
      { status: 409 }
    );
  }

  return null;
}

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(request, auth.session);

  const accessError = validateMultiBrandAccess(access);
  if (accessError) return accessError;

  try {
    await ensureDefaultMarca(access);

    const { data, error } = await supabaseAdmin
      .from('marcas')
      .select(MARCAS_SELECT)
      .eq('tenant_id', access.tenantId)
      .order('activa', { ascending: false })
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      tenantId: access.tenantId,
      plan: access.plan,
      limit:
        access.plan === 'pro'
          ? {
              active_brands: PRO_ACTIVE_BRANDS_LIMIT,
              unlimited: false,
            }
          : {
              active_brands: null,
              unlimited: true,
            },
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

  const accessError = validateMultiBrandAccess(access);
  if (accessError) return accessError;

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

  const activa = normalizeBoolean(body?.activa, true);

  try {
    await ensureDefaultMarca(access);

    const limitError = await validateBrandLimitForCreate(access, activa);
    if (limitError) return limitError;

    const payload = {
      tenant_id: access.tenantId,
      restaurant_id: access.restaurant?.id ?? null,
      slug: access.restaurant?.slug ?? access.tenantId,
      nombre,
      descripcion: normalizeNullableString(body?.descripcion),
      logo_url: normalizeNullableString(body?.logo_url),
      color_hex: normalizeNullableString(body?.color_hex),
      activa,
      orden: normalizeInteger(body?.orden, 0),
    };

    const { data, error } = await supabaseAdmin
      .from('marcas')
      .insert([payload])
      .select(MARCAS_SELECT)
      .single();

    if (error) throw error;

    return NextResponse.json(
      {
        ok: true,
        marca: data,
        limit:
          access.plan === 'pro'
            ? {
                active_brands: PRO_ACTIVE_BRANDS_LIMIT,
                unlimited: false,
              }
            : {
                active_brands: null,
                unlimited: true,
              },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/admin/marcas error:', error);
    return NextResponse.json(
      { error: 'No se pudo crear la marca.' },
      { status: 500 }
    );
  }
}