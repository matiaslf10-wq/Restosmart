import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  getFallbackAdminAccess,
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
  type AdminAccessSnapshot,
} from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const PRODUCTO_SELECT = `
  id,
  nombre,
  descripcion,
  precio,
  categoria,
  disponible,
  imagen_url,
  control_stock,
  stock_actual,
  permitir_sin_stock,
  marca_id
`;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeNonEmptyString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return fallback;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeNullableString(value: unknown) {
  return normalizeNonEmptyString(value);
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
  request.nextUrl.searchParams.get('restaurant'),
  request.nextUrl.searchParams.get('restaurantSlug'),
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
    console.error('Productos access resolution error:', error);
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

function canUseStockControl(access: AdminAccessSnapshot) {
  const accessRecord = asRecord(access);
  const capabilitiesRecord = asRecord(accessRecord?.capabilities);

  return (
    capabilitiesRecord?.stock_control === true ||
    access.plan === 'pro' ||
    access.plan === 'intelligence'
  );
}

async function getDefaultMarcaId(access: AdminAccessSnapshot) {
  const { data, error } = await supabaseAdmin
    .from('marcas')
    .select('id')
    .eq('tenant_id', access.tenantId)
    .eq('activa', true)
    .order('orden', { ascending: true })
    .order('creado_en', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error leyendo marca principal:', error);
    return null;
  }

  return typeof data?.id === 'string' ? data.id : null;
}

async function resolveMarcaIdForProduct(
  requestedMarcaId: unknown,
  access: AdminAccessSnapshot
) {
  if (!canUseMultiBrand(access)) {
    return null;
  }

  const marcaId = normalizeNullableString(requestedMarcaId);

  if (!marcaId) {
    return await getDefaultMarcaId(access);
  }

  const { data, error } = await supabaseAdmin
    .from('marcas')
    .select('id')
    .eq('id', marcaId)
    .eq('tenant_id', access.tenantId)
    .eq('activa', true)
    .maybeSingle();

  if (error) {
    console.error('Error validando marca de producto:', error);
    throw new Error('No se pudo validar la marca del producto.');
  }

  if (!data?.id) {
    throw new Error('La marca seleccionada no existe o no pertenece a este local.');
  }

  return data.id as string;
}

function shouldFilterProductsByTenant(req: NextRequest) {
  return !!pickFirstString(
    req.nextUrl.searchParams.get('restaurant'),
    req.nextUrl.searchParams.get('restaurantSlug'),
    req.nextUrl.searchParams.get('tenant'),
    req.nextUrl.searchParams.get('tenantSlug'),
    req.nextUrl.searchParams.get('slug'),
    req.nextUrl.searchParams.get('restaurantId'),
    req.nextUrl.searchParams.get('restaurant_id'),
    req.headers.get('x-tenant-id'),
    req.headers.get('x-tenant-slug'),
    req.headers.get('x-restaurant-id')
  );
}

async function getMarcaIdsForTenant(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('marcas')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('activa', true);

  if (error) {
    console.error('Error leyendo marcas del tenant:', error);
    throw new Error('No se pudieron leer las marcas del local.');
  }

  return ((data ?? []) as Array<{ id: string | null }>)
    .map((row) => row.id)
    .filter((id): id is string => !!id);
}

export async function GET(req: NextRequest) {
  try {
    const soloDisponibles =
      req.nextUrl.searchParams.get('soloDisponibles') === '1';

    const filterByTenant = shouldFilterProductsByTenant(req);
    const access = filterByTenant
      ? await resolveAccessForRequest(req, null)
      : null;

    let marcaIds: string[] | null = null;

    if (filterByTenant && access?.tenantId) {
      marcaIds = await getMarcaIdsForTenant(access.tenantId);

      if (marcaIds.length === 0) {
        return NextResponse.json([]);
      }
    }

    let query = supabaseAdmin
      .from('productos')
      .select(PRODUCTO_SELECT)
      .order('categoria', { ascending: true })
      .order('nombre', { ascending: true });

    if (soloDisponibles) {
      query = query.eq('disponible', true);
    }

    if (marcaIds) {
      query = query.in('marca_id', marcaIds);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    return NextResponse.json(
      { error: 'No se pudieron cargar los productos.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(req, auth.session);

  try {
    const body = await req.json();

    const stockControlEnabled = canUseStockControl(access);
    const control_stock =
      stockControlEnabled && normalizeBoolean(body?.control_stock, false);

    const stock_actual = control_stock
      ? Math.max(0, Math.trunc(normalizeNumber(body?.stock_actual, 0)))
      : 0;

    const permitir_sin_stock = control_stock
      ? normalizeBoolean(body?.permitir_sin_stock, false)
      : true;

    const marca_id = await resolveMarcaIdForProduct(body?.marca_id, access);

    const payload = {
      nombre: String(body?.nombre ?? '').trim(),
      descripcion: body?.descripcion ? String(body.descripcion).trim() : null,
      precio: normalizeNumber(body?.precio, 0),
      categoria: body?.categoria ? String(body.categoria).trim() : null,
      disponible: normalizeBoolean(body?.disponible, true),
      imagen_url: body?.imagen_url ? String(body.imagen_url).trim() : null,
      control_stock,
      stock_actual,
      permitir_sin_stock,
      marca_id,
    };

    if (!payload.nombre) {
      return NextResponse.json(
        { error: 'El nombre es obligatorio.' },
        { status: 400 }
      );
    }

    if (!payload.categoria) {
      return NextResponse.json(
        { error: 'La categoría es obligatoria.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('productos')
      .insert([payload])
      .select(PRODUCTO_SELECT)
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creando producto:', error);

    const message =
      error instanceof Error ? error.message : 'No se pudo crear el producto.';

    return NextResponse.json(
      { error: message || 'No se pudo crear el producto.' },
      { status: 500 }
    );
  }
}