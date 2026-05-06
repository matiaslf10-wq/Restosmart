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

type Params = {
  params: Promise<{ id: string }>;
};

type ProductoOwnershipRow = {
  id: number;
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
    console.error('Producto access resolution error:', error);
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

  return ((data ?? []) as RestaurantRow[]).filter(
    (restaurant) => restaurant.id !== null && restaurant.id !== undefined
  );
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

async function getRestaurantIdsForProduct(productoId: number) {
  const { data, error } = await supabaseAdmin
    .from('producto_restaurantes')
    .select('producto_id, restaurant_id, visible_en_menu')
    .eq('producto_id', productoId)
    .eq('visible_en_menu', true);

  if (error) {
    console.error('Error leyendo sucursales del producto:', error);
    return [];
  }

  return ((data ?? []) as ProductRestaurantRow[])
    .map((row) => row.restaurant_id)
    .filter((id): id is number | string => id !== null && id !== undefined)
    .map((id) => String(id));
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

  const selectedIds = new Set(validRestaurantIds);

  const rows = activeRestaurantIds.map((restaurantId) => ({
    producto_id: productId,
    restaurant_id: restaurantId,
    visible_en_menu: selectedIds.has(restaurantId),
    actualizado_en: new Date().toISOString(),
  }));

  if (rows.length === 0) {
    await supabaseAdmin
      .from('producto_restaurantes')
      .delete()
      .eq('producto_id', productId);

    return [];
  }

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

async function validateProductBelongsToAccess(
  productoId: number,
  access: AdminAccessSnapshot
) {
  const { data: producto, error: productoError } = await supabaseAdmin
    .from('productos')
    .select('id, marca_id')
    .eq('id', productoId)
    .maybeSingle();

  if (productoError) {
    throw productoError;
  }

  if (!producto?.id) {
    return NextResponse.json(
      { error: 'Producto no encontrado.' },
      { status: 404 }
    );
  }

  if (!canUseMultiBrand(access)) {
    return null;
  }

  const productoRow = producto as ProductoOwnershipRow;

  if (!productoRow.marca_id) {
    return NextResponse.json(
      {
        error:
          'Este producto no tiene marca asignada y no se puede validar contra el tenant actual.',
      },
      { status: 409 }
    );
  }

  const { data: marca, error: marcaError } = await supabaseAdmin
    .from('marcas')
    .select('id')
    .eq('id', productoRow.marca_id)
    .eq('tenant_id', access.tenantId)
    .maybeSingle();

  if (marcaError) {
    throw marcaError;
  }

  if (!marca?.id) {
    return NextResponse.json(
      { error: 'Producto no encontrado para este tenant.' },
      { status: 404 }
    );
  }

  return null;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(req, auth.session);

  try {
    const { id } = await params;
    const productoId = Number(id);

    if (!Number.isFinite(productoId) || productoId <= 0) {
      return NextResponse.json(
        { error: 'ID de producto inválido.' },
        { status: 400 }
      );
    }

    const accessError = await validateProductBelongsToAccess(productoId, access);
    if (accessError) return accessError;

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
      marca_id,
      disponible: normalizeBoolean(body?.disponible, true),
      imagen_url: body?.imagen_url ? String(body.imagen_url).trim() : null,
      control_stock,
      stock_actual,
      permitir_sin_stock,
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
      .update(payload)
      .eq('id', productoId)
      .select(PRODUCTO_SELECT)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: 'Producto no encontrado.' },
        { status: 404 }
      );
    }

    const restaurantIdsWasProvided =
  Array.isArray(body?.restaurant_ids) || Array.isArray(body?.restaurantIds);

const restaurantIds = restaurantIdsWasProvided
  ? await syncProductRestaurants({
      productId: productoId,
      restaurantIds: normalizeIdList(body?.restaurant_ids ?? body?.restaurantIds),
      access,
    })
  : await getRestaurantIdsForProduct(productoId);

return NextResponse.json({
  ...data,
  restaurant_ids: restaurantIds,
});
  } catch (error) {
    console.error('Error actualizando producto:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'No se pudo actualizar el producto.';

    return NextResponse.json(
      { error: message || 'No se pudo actualizar el producto.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(req, auth.session);

  try {
    const { id } = await params;
    const productoId = Number(id);

    if (!Number.isFinite(productoId) || productoId <= 0) {
      return NextResponse.json(
        { error: 'ID de producto inválido.' },
        { status: 400 }
      );
    }

    const accessError = await validateProductBelongsToAccess(productoId, access);
    if (accessError) return accessError;

    const { data, error } = await supabaseAdmin
      .from('productos')
      .delete()
      .eq('id', productoId)
      .select('id')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: 'Producto no encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (error) {
    console.error('Error eliminando producto:', error);
    return NextResponse.json(
      { error: 'No se pudo eliminar el producto.' },
      { status: 500 }
    );
  }
}