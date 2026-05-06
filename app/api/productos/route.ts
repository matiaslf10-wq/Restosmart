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

type ProductoRow = {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  disponible: boolean | null;
  imagen_url: string | null;
  control_stock: boolean | null;
  stock_actual: number | null;
  permitir_sin_stock: boolean | null;
  marca_id: string | null;
};

type ProductRestaurantRow = {
  producto_id: number | string | null;
  restaurant_id: number | string | null;
  visible_en_menu: boolean | null;
};

type RestaurantRow = {
  id: number | string;
  slug: string | null;
  estado: string | null;
  owner_tenant_id: string | null;
};

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

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => normalizeNonEmptyString(item))
        .filter((item): item is string => !!item)
    )
  );
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

async function getVisibleProductIdsForRestaurant(restaurantId: string | number) {
  const { data, error } = await supabaseAdmin
    .from('producto_restaurantes')
    .select('producto_id')
    .eq('restaurant_id', restaurantId)
    .eq('visible_en_menu', true);

  if (error) {
    console.error('Error leyendo productos visibles por restaurante:', error);
    throw new Error('No se pudieron leer los productos visibles de esta sucursal.');
  }

  return ((data ?? []) as ProductRestaurantRow[])
    .map((row) => row.producto_id)
    .filter((id): id is number | string => id !== null && id !== undefined);
}

async function enrichProductsWithRestaurantIds(products: ProductoRow[]) {
  if (products.length === 0) return [];

  const productIds = products.map((product) => product.id);

  const { data, error } = await supabaseAdmin
    .from('producto_restaurantes')
    .select('producto_id, restaurant_id, visible_en_menu')
    .in('producto_id', productIds);

  if (error) {
    console.error('Error leyendo sucursales de productos:', error);

    return products.map((product) => ({
      ...product,
      restaurant_ids: [],
    }));
  }

  const restaurantIdsByProductId = new Map<number, string[]>();

  for (const row of (data ?? []) as ProductRestaurantRow[]) {
    if (row.visible_en_menu === false) continue;
    if (row.producto_id === null || row.producto_id === undefined) continue;
    if (row.restaurant_id === null || row.restaurant_id === undefined) continue;

    const productId = Number(row.producto_id);
    const current = restaurantIdsByProductId.get(productId) ?? [];

    current.push(String(row.restaurant_id));
    restaurantIdsByProductId.set(productId, current);
  }

  return products.map((product) => ({
    ...product,
    restaurant_ids: restaurantIdsByProductId.get(Number(product.id)) ?? [],
  }));
}

async function getActiveRestaurantsForTenant(access: AdminAccessSnapshot) {
  const { data, error } = await supabaseAdmin
    .from('restaurants')
    .select('id, slug, estado, owner_tenant_id')
    .eq('owner_tenant_id', access.tenantId)
    .neq('estado', 'cerrado')
    .order('slug', { ascending: true });

  if (error) {
    console.error('Error leyendo restaurantes del tenant:', error);
    throw new Error('No se pudieron leer las sucursales del tenant.');
  }

  return ((data ?? []) as RestaurantRow[]).filter((restaurant) => !!restaurant.id);
}

async function validateRestaurantIdsForTenant(
  requestedRestaurantIds: string[],
  access: AdminAccessSnapshot
) {
  if (requestedRestaurantIds.length === 0) {
    return [];
  }

  const activeRestaurants = await getActiveRestaurantsForTenant(access);

  const allowedIds = new Set(
    activeRestaurants.map((restaurant) => String(restaurant.id))
  );

  const invalidIds = requestedRestaurantIds.filter((id) => !allowedIds.has(id));

  if (invalidIds.length > 0) {
    throw new Error(
      'Hay sucursales seleccionadas que no existen, están cerradas o no pertenecen a este tenant.'
    );
  }

  return requestedRestaurantIds;
}

async function syncProductRestaurants(params: {
  productId: number;
  restaurantIds: string[];
  access: AdminAccessSnapshot;
}) {
  const { productId, restaurantIds, access } = params;

  const validRestaurantIds = await validateRestaurantIdsForTenant(
    restaurantIds,
    access
  );

  const activeRestaurants = await getActiveRestaurantsForTenant(access);
  const activeRestaurantIds = activeRestaurants.map((restaurant) =>
    String(restaurant.id)
  );

  if (activeRestaurantIds.length === 0) {
    await supabaseAdmin
      .from('producto_restaurantes')
      .delete()
      .eq('producto_id', productId);

    return [];
  }

  const selectedIds = new Set(validRestaurantIds);

  const rows = activeRestaurantIds.map((restaurantId) => ({
    producto_id: productId,
    restaurant_id: restaurantId,
    visible_en_menu: selectedIds.has(restaurantId),
    actualizado_en: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from('producto_restaurantes')
    .upsert(rows, {
      onConflict: 'producto_id,restaurant_id',
    });

  if (error) {
    console.error('Error sincronizando producto_restaurantes:', error);
    throw new Error('No se pudo guardar en qué sucursales aparece el producto.');
  }

  return validRestaurantIds;
}

export async function GET(req: NextRequest) {
  try {
    const soloDisponibles =
      req.nextUrl.searchParams.get('soloDisponibles') === '1';

    const filterByTenant = shouldFilterProductsByTenant(req);
    const access = filterByTenant
      ? await resolveAccessForRequest(req, null)
      : null;

    let visibleProductIds: Array<string | number> | null = null;

    if (filterByTenant) {
      const restaurantId = access?.restaurant?.id;

      if (!restaurantId) {
        return NextResponse.json([]);
      }

      visibleProductIds = await getVisibleProductIdsForRestaurant(restaurantId);

      if (visibleProductIds.length === 0) {
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

    if (visibleProductIds) {
      query = query.in('id', visibleProductIds);
    }

    const { data, error } = await query;

    if (error) throw error;

    const enriched = await enrichProductsWithRestaurantIds(
      ((data ?? []) as ProductoRow[]) ?? []
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error('Error obteniendo productos:', error);

    const message =
      error instanceof Error ? error.message : 'No se pudieron cargar los productos.';

    return NextResponse.json(
      { error: message || 'No se pudieron cargar los productos.' },
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

    const requestedRestaurantIds = normalizeIdList(
      body?.restaurant_ids ?? body?.restaurantIds
    );

    const activeRestaurants = await getActiveRestaurantsForTenant(access);
    const defaultRestaurantIds = activeRestaurants.map((restaurant) =>
      String(restaurant.id)
    );

    const restaurantIdsToUse =
      requestedRestaurantIds.length > 0
        ? requestedRestaurantIds
        : defaultRestaurantIds;

    const { data, error } = await supabaseAdmin
      .from('productos')
      .insert([payload])
      .select(PRODUCTO_SELECT)
      .single();

    if (error) throw error;

    const product = data as ProductoRow;

    const restaurantIds = await syncProductRestaurants({
      productId: Number(product.id),
      restaurantIds: restaurantIdsToUse,
      access,
    });

    return NextResponse.json(
      {
        ...product,
        restaurant_ids: restaurantIds,
      },
      { status: 201 }
    );
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