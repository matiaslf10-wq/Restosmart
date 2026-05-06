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
  control_stock: boolean | null;
  stock_actual: number | string | null;
  permitir_sin_stock: boolean | null;
};

type ProductRestaurantConfig = {
  restaurant_id: string;
  visible_en_menu: boolean;
  control_stock: boolean;
  stock_actual: number;
  permitir_sin_stock: boolean;
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

function normalizeStockQuantity(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.trunc(num));
}

function normalizeRestaurantConfigs(value: unknown): ProductRestaurantConfig[] {
  if (!Array.isArray(value)) return [];

  const byRestaurantId = new Map<string, ProductRestaurantConfig>();

  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;

    const restaurantId = normalizeNonEmptyString(record.restaurant_id);
    if (!restaurantId) continue;

    byRestaurantId.set(restaurantId, {
      restaurant_id: restaurantId,
      visible_en_menu: normalizeBoolean(record.visible_en_menu, true),
      control_stock: normalizeBoolean(record.control_stock, false),
      stock_actual: normalizeStockQuantity(record.stock_actual),
      permitir_sin_stock: normalizeBoolean(record.permitir_sin_stock, true),
    });
  }

  return Array.from(byRestaurantId.values());
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

async function getVisibleProductConfigsForRestaurant(
  restaurantId: string | number
) {
  const { data, error } = await supabaseAdmin
    .from('producto_restaurantes')
    .select(
      'producto_id, restaurant_id, visible_en_menu, control_stock, stock_actual, permitir_sin_stock'
    )
    .eq('restaurant_id', restaurantId)
    .eq('visible_en_menu', true);

  if (error) {
    console.error('Error leyendo productos visibles por restaurante:', error);
    throw new Error('No se pudieron leer los productos visibles de esta sucursal.');
  }

  const configsByProductId = new Map<number, ProductRestaurantConfig>();

  for (const row of (data ?? []) as ProductRestaurantRow[]) {
    if (row.producto_id === null || row.producto_id === undefined) continue;
    if (row.restaurant_id === null || row.restaurant_id === undefined) continue;

    configsByProductId.set(Number(row.producto_id), {
      restaurant_id: String(row.restaurant_id),
      visible_en_menu: row.visible_en_menu !== false,
      control_stock: row.control_stock === true,
      stock_actual: normalizeStockQuantity(row.stock_actual),
      permitir_sin_stock: row.permitir_sin_stock !== false,
    });
  }

  return configsByProductId;
}

async function enrichProductsWithRestaurantIds(products: ProductoRow[]) {
  if (products.length === 0) return [];

  const productIds = products.map((product) => product.id);

  const { data, error } = await supabaseAdmin
    .from('producto_restaurantes')
    .select(
      'producto_id, restaurant_id, visible_en_menu, control_stock, stock_actual, permitir_sin_stock'
    )
    .in('producto_id', productIds);

  if (error) {
    console.error('Error leyendo sucursales de productos:', error);

    return products.map((product) => ({
      ...product,
      restaurant_ids: [],
      restaurant_configs: [],
    }));
  }

  const configsByProductId = new Map<number, ProductRestaurantConfig[]>();

  for (const row of (data ?? []) as ProductRestaurantRow[]) {
    if (row.producto_id === null || row.producto_id === undefined) continue;
    if (row.restaurant_id === null || row.restaurant_id === undefined) continue;

    const productId = Number(row.producto_id);
    const restaurantId = String(row.restaurant_id);

    const current = configsByProductId.get(productId) ?? [];

    current.push({
      restaurant_id: restaurantId,
      visible_en_menu: row.visible_en_menu !== false,
      control_stock: row.control_stock === true,
      stock_actual: normalizeStockQuantity(row.stock_actual),
      permitir_sin_stock: row.permitir_sin_stock !== false,
    });

    configsByProductId.set(productId, current);
  }

  return products.map((product) => {
    const configs = configsByProductId.get(Number(product.id)) ?? [];

    return {
      ...product,
      restaurant_ids: configs
        .filter((config) => config.visible_en_menu)
        .map((config) => config.restaurant_id),
      restaurant_configs: configs,
    };
  });
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
  restaurantConfigs?: ProductRestaurantConfig[];
  access: AdminAccessSnapshot;
  controlStock: boolean;
  permitirSinStock: boolean;
}) {
  const {
    productId,
    restaurantIds,
    restaurantConfigs = [],
    access,
    controlStock,
    permitirSinStock,
  } = params;

  const hasRestaurantConfigs = restaurantConfigs.length > 0;

  const idsToValidate = hasRestaurantConfigs
    ? restaurantConfigs.map((config) => config.restaurant_id)
    : restaurantIds;

  await validateRestaurantIdsForTenant(idsToValidate, access);

  const activeRestaurants = await getActiveRestaurantsForTenant(access);
  const activeRestaurantIds = activeRestaurants.map((restaurant) =>
    String(restaurant.id)
  );

  if (activeRestaurantIds.length === 0) {
    await supabaseAdmin
      .from('producto_restaurantes')
      .delete()
      .eq('producto_id', productId);

    return {
      restaurantIds: [],
      restaurantConfigs: [],
    };
  }

  const configsByRestaurantId = new Map(
    restaurantConfigs.map((config) => [config.restaurant_id, config])
  );

  const selectedIds = new Set(
    hasRestaurantConfigs
      ? restaurantConfigs
          .filter((config) => config.visible_en_menu)
          .map((config) => config.restaurant_id)
      : restaurantIds
  );

  const now = new Date().toISOString();

  const rows = activeRestaurantIds.map((restaurantId) => {
    const config = configsByRestaurantId.get(restaurantId);
    const visible = selectedIds.has(restaurantId);
    const rowControlStock = visible && (config?.control_stock ?? controlStock);

    return {
      producto_id: productId,
      restaurant_id: restaurantId,
      visible_en_menu: visible,
      control_stock: rowControlStock,
      stock_actual:
        visible && rowControlStock
          ? normalizeStockQuantity(config?.stock_actual ?? 0)
          : 0,
      permitir_sin_stock: rowControlStock
        ? config?.permitir_sin_stock ?? permitirSinStock
        : true,
      actualizado_en: now,
    };
  });

  const { error } = await supabaseAdmin
    .from('producto_restaurantes')
    .upsert(rows, {
      onConflict: 'producto_id,restaurant_id',
    });

  if (error) {
    console.error('Error sincronizando producto_restaurantes:', error);
    throw new Error('No se pudo guardar en qué sucursales aparece el producto.');
  }

  const syncedConfigs = rows.map((row) => ({
    restaurant_id: String(row.restaurant_id),
    visible_en_menu: row.visible_en_menu,
    control_stock: row.control_stock,
    stock_actual: row.stock_actual,
    permitir_sin_stock: row.permitir_sin_stock,
  }));

  return {
    restaurantIds: syncedConfigs
      .filter((config) => config.visible_en_menu)
      .map((config) => config.restaurant_id),
    restaurantConfigs: syncedConfigs,
  };
}

export async function GET(req: NextRequest) {
  try {
    const soloDisponibles =
      req.nextUrl.searchParams.get('soloDisponibles') === '1';

    const filterByTenant = shouldFilterProductsByTenant(req);
    const access = filterByTenant
      ? await resolveAccessForRequest(req, null)
      : null;

        let visibleProductConfigs: Map<number, ProductRestaurantConfig> | null = null;
    let visibleProductIds: number[] | null = null;

        if (filterByTenant) {
      const restaurantId = access?.restaurant?.id;

      if (!restaurantId) {
        return NextResponse.json([]);
      }

      visibleProductConfigs = await getVisibleProductConfigsForRestaurant(
        restaurantId
      );

      visibleProductIds = Array.from(visibleProductConfigs.keys());

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

        const productosData = (data ?? []) as ProductoRow[];
    const enriched = await enrichProductsWithRestaurantIds(productosData);

    if (filterByTenant && visibleProductConfigs) {
      const productsForRestaurant = enriched.map((product) => {
        const restaurantConfig = visibleProductConfigs?.get(Number(product.id));

        if (!restaurantConfig) {
          return product;
        }

        return {
          ...product,
          control_stock: restaurantConfig.control_stock,
          stock_actual: restaurantConfig.stock_actual,
          permitir_sin_stock: restaurantConfig.permitir_sin_stock,
          restaurant_ids: [restaurantConfig.restaurant_id],
          restaurant_configs: [restaurantConfig],
        };
      });

      return NextResponse.json(productsForRestaurant);
    }

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

        const restaurantConfigsWasProvided =
      Array.isArray(body?.restaurant_configs) ||
      Array.isArray(body?.restaurantConfigs);

    const requestedRestaurantConfigs = normalizeRestaurantConfigs(
      Array.isArray(body?.restaurant_configs)
        ? body.restaurant_configs
        : body?.restaurantConfigs
    );

    const restaurantIdsWasProvided =
      restaurantConfigsWasProvided ||
      Array.isArray(body?.restaurant_ids) ||
      Array.isArray(body?.restaurantIds);

    const rawRestaurantIds = Array.isArray(body?.restaurant_ids)
      ? body.restaurant_ids
      : body?.restaurantIds;

    const requestedRestaurantIds = restaurantConfigsWasProvided
      ? requestedRestaurantConfigs
          .filter((config) => config.visible_en_menu)
          .map((config) => config.restaurant_id)
      : normalizeIdList(rawRestaurantIds);

    const activeRestaurants = await getActiveRestaurantsForTenant(access);
    const defaultRestaurantIds = activeRestaurants.map((restaurant) =>
      String(restaurant.id)
    );

    const restaurantIdsToUse = restaurantIdsWasProvided
      ? requestedRestaurantIds
      : defaultRestaurantIds;

    const restaurantConfigsToUse = restaurantConfigsWasProvided
      ? requestedRestaurantConfigs
      : restaurantIdsToUse.map((restaurantId) => ({
          restaurant_id: restaurantId,
          visible_en_menu: true,
          control_stock,
          stock_actual: control_stock ? stock_actual : 0,
          permitir_sin_stock,
        }));

    const { data, error } = await supabaseAdmin
      .from('productos')
      .insert([payload])
      .select(PRODUCTO_SELECT)
      .single();

    if (error) throw error;

    const product = data as ProductoRow;

        const restaurantSync = await syncProductRestaurants({
      productId: Number(product.id),
      restaurantIds: restaurantIdsToUse,
      restaurantConfigs: restaurantConfigsToUse,
      access,
      controlStock: control_stock,
      permitirSinStock: permitir_sin_stock,
    });

    return NextResponse.json(
      {
        ...product,
        restaurant_ids: restaurantSync.restaurantIds,
        restaurant_configs: restaurantSync.restaurantConfigs,
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