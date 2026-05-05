import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  getFallbackAdminAccess,
  resolveAdminAccess,
  type AdminAccessSnapshot,
} from '@/lib/adminAccess';
import {
  normalizeBusinessMode,
  normalizePlan,
  type BusinessMode,
  type PlanCode,
} from '@/lib/plans';

type RestaurantStatus = 'activo' | 'pausado' | 'cerrado';

type RestaurantRow = {
  id: string | number;
  slug: string | null;
  plan: string | null;
  owner_tenant_id?: string | null;
  estado?: RestaurantStatus | null;
  cerrado_en?: string | null;
  cerrado_motivo?: string | null;
};

type LocalConfigRow = {
  restaurant_id: string | number | null;
  nombre_local: string | null;
  direccion: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  horario_atencion: string | null;
  business_mode: string | null;
};

type TenantAddonRow = {
  tenant_id: string | null;
  addon_key: string | null;
  enabled: boolean | null;
};

function normalizeNonEmptyString(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeSlug(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
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

function getUnknownErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  if (
    error &&
    typeof error === 'object' &&
    'details' in error &&
    typeof error.details === 'string'
  ) {
    return error.details;
  }

  return String(error);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeNonEmptyString(value);
    if (text) return text;
  }

  return null;
}

async function resolveAccessForRequest(
  req: NextRequest,
  session: unknown
): Promise<AdminAccessSnapshot> {
  const sessionRecord = asRecord(session);
  const restaurantRecord = asRecord(sessionRecord?.restaurant);

  const tenantSlug = pickFirstString(
    req.nextUrl.searchParams.get('tenant'),
    req.nextUrl.searchParams.get('tenantSlug'),
    req.nextUrl.searchParams.get('slug'),
    req.headers.get('x-tenant-id'),
    req.headers.get('x-tenant-slug'),
    req.cookies.get('tenant')?.value,
    req.cookies.get('tenant_slug')?.value,
    restaurantRecord?.slug,
    sessionRecord?.tenantId,
    sessionRecord?.tenant_id,
    sessionRecord?.slug
  );

  try {
    return await resolveAdminAccess({ tenantSlug });
  } catch (error) {
    console.error('Restaurants access resolution error:', error);
    return getFallbackAdminAccess();
  }
}

function getRestaurantLimitForPlan(plan: PlanCode) {
  if (plan === 'intelligence') return null;
  if (plan === 'pro') return 3;
  return 1;
}

function normalizeRestaurantStatus(value: unknown): RestaurantStatus {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (normalized === 'cerrado') return 'cerrado';
  if (normalized === 'pausado') return 'pausado';

  return 'activo';
}

function canUseMultiBrand(access: AdminAccessSnapshot) {
  return !!access.capabilities?.multi_brand || !!access.addons?.multi_brand;
}

async function getMultiBrandEnabledByTenant(slug: string) {
  const { data, error } = await supabaseAdmin
    .from('tenant_addons')
    .select('enabled')
    .eq('tenant_id', slug)
    .eq('addon_key', 'multi_brand')
    .maybeSingle();

  if (error) {
    console.error('Error leyendo multi_brand:', error);
    return false;
  }

  return data?.enabled === true;
}

async function setMultiBrandEnabled(slug: string, enabled: boolean) {
  const { data: existing, error: readError } = await supabaseAdmin
    .from('tenant_addons')
    .select('tenant_id, addon_key')
    .eq('tenant_id', slug)
    .eq('addon_key', 'multi_brand')
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (existing) {
    const { error } = await supabaseAdmin
      .from('tenant_addons')
      .update({ enabled })
      .eq('tenant_id', slug)
      .eq('addon_key', 'multi_brand');

    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from('tenant_addons').insert({
    tenant_id: slug,
    addon_key: 'multi_brand',
    enabled,
  });

  if (error) throw error;
}

export async function GET(req: NextRequest) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
  }

const access = await resolveAccessForRequest(req, auth.session);
const ownerTenantId = access.tenantId;
const restaurantLimit = getRestaurantLimitForPlan(access.plan);
  const multiBrandEnabled = canUseMultiBrand(access);

  try {
    const { data: restaurantsData, error: restaurantsError } =
      await supabaseAdmin
        .from('restaurants')
        .select(
          'id, slug, plan, owner_tenant_id, estado, cerrado_en, cerrado_motivo'
        )
        .eq('owner_tenant_id', ownerTenantId)
        .order('slug', { ascending: true });

    if (restaurantsError) throw restaurantsError;

    const restaurants = ((restaurantsData ?? []) as RestaurantRow[]).filter(
      (row) => !!row.slug
    );

    const restaurantIds = restaurants.map((row) => row.id);

    const configsResult =
      restaurantIds.length > 0
        ? await supabaseAdmin
            .from('configuracion_local')
            .select(
              'restaurant_id, nombre_local, direccion, telefono, celular, email, horario_atencion, business_mode'
            )
            .in('restaurant_id', restaurantIds)
        : { data: [], error: null };

    if (configsResult.error) throw configsResult.error;

    const configs = (configsResult.data ?? []) as LocalConfigRow[];

    const configByRestaurantId = new Map(
      configs.map((config) => [String(config.restaurant_id), config])
    );

    const items = restaurants.map((restaurant) => {
      const slug = restaurant.slug ?? '';
      const config = configByRestaurantId.get(String(restaurant.id)) ?? null;
      const estado = normalizeRestaurantStatus(restaurant.estado);

      return {
        id: String(restaurant.id),
        slug,
        nombre_local: config?.nombre_local ?? '',
        direccion: config?.direccion ?? '',
        telefono: config?.telefono ?? '',
        celular: config?.celular ?? '',
        email: config?.email ?? '',
        horario_atencion: config?.horario_atencion ?? '',
        business_mode: normalizeBusinessMode(config?.business_mode),
        multi_brand: multiBrandEnabled,
        estado,
        cerrado_en: restaurant.cerrado_en ?? null,
        cerrado_motivo: restaurant.cerrado_motivo ?? null,
      };
    });

    const activeCount = items.filter((item) => item.estado === 'activo').length;
    const closedCount = items.filter((item) => item.estado === 'cerrado').length;

    return NextResponse.json({
      items,
      meta: {
        tenantId: ownerTenantId,
        plan: access.plan,
        restaurant_limit: restaurantLimit,
        restaurants_active: activeCount,
        restaurants_closed: closedCount,
        restaurants_remaining:
          restaurantLimit === null
            ? null
            : Math.max(restaurantLimit - activeCount, 0),
        multi_brand: multiBrandEnabled,
      },
    });
  } catch (error) {
    const message = getUnknownErrorMessage(error);

    console.error('GET /api/admin/restaurants', error);

    return NextResponse.json(
      {
        error: `No se pudieron cargar los restaurantes. Detalle: ${message}`,
      },
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
  const ownerTenantId = access.tenantId;
  const restaurantLimit = getRestaurantLimitForPlan(access.plan);

  try {
    const body = await req.json().catch(() => null);

    const nombreLocal = normalizeNonEmptyString(body?.nombre_local);
    const slug = normalizeSlug(body?.slug ?? nombreLocal);
    const technicalPlanFallback = access.plan as PlanCode;
    const businessMode = normalizeBusinessMode(body?.business_mode) as BusinessMode;
    const multiBrand = normalizeBoolean(body?.multi_brand, false);

    if (!nombreLocal) {
      return NextResponse.json(
        { error: 'El nombre del local es obligatorio.' },
        { status: 400 }
      );
    }

    if (!slug) {
      return NextResponse.json(
        { error: 'El slug del restaurante es obligatorio.' },
        { status: 400 }
      );
    }

    if (restaurantLimit !== null) {
      const { count, error: countError } = await supabaseAdmin
        .from('restaurants')
        .select('id', { count: 'exact', head: true })
        .eq('owner_tenant_id', ownerTenantId)
        .eq('estado', 'activo');

      if (countError) throw countError;

      const activeRestaurants = count ?? 0;

      if (activeRestaurants >= restaurantLimit) {
        return NextResponse.json(
          {
            error:
              access.plan === 'pro'
                ? 'El plan Pro permite hasta 3 restaurantes activos. Para agregar más, cerrá una sucursal o pasá el tenant a Intelligence.'
                : 'El plan Esencial permite solo 1 restaurante activo. Para agregar más, pasá el tenant a Pro o Intelligence.',
          },
          { status: 403 }
        );
      }
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('restaurants')
      .select('id, slug')
      .eq('slug', slug)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing?.id) {
      return NextResponse.json(
        { error: 'Ya existe un restaurante con ese slug.' },
        { status: 409 }
      );
    }

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from('restaurants')
      .insert({
        slug,
        plan: technicalPlanFallback,
        owner_tenant_id: ownerTenantId,
        estado: 'activo',
      })
      .select('id, slug, plan')
      .single();

    if (restaurantError || !restaurant?.id) {
      throw restaurantError ?? new Error('No se pudo crear el restaurante.');
    }

    const { error: configError } = await supabaseAdmin
      .from('configuracion_local')
      .insert({
        restaurant_id: restaurant.id,
        nombre_local: nombreLocal,
        direccion: normalizeNonEmptyString(body?.direccion) ?? '',
        telefono: normalizeNonEmptyString(body?.telefono) ?? '',
        celular: normalizeNonEmptyString(body?.celular) ?? '',
        email: normalizeNonEmptyString(body?.email) ?? '',
        horario_atencion:
          normalizeNonEmptyString(body?.horario_atencion) ?? '',
        google_analytics_id: '',
        google_analytics_property_id: '',
        business_mode: businessMode,
      });

    if (configError) {
      await supabaseAdmin.from('restaurants').delete().eq('id', restaurant.id);
      throw configError;
    }

    await setMultiBrandEnabled(ownerTenantId, multiBrand);

    return NextResponse.json(
      {
        ok: true,
        restaurant: {
          id: String(restaurant.id),
          slug,
          nombre_local: nombreLocal,
          direccion: normalizeNonEmptyString(body?.direccion) ?? '',
          telefono: normalizeNonEmptyString(body?.telefono) ?? '',
          celular: normalizeNonEmptyString(body?.celular) ?? '',
          email: normalizeNonEmptyString(body?.email) ?? '',
          horario_atencion:
            normalizeNonEmptyString(body?.horario_atencion) ?? '',
          business_mode: businessMode,
          multi_brand: await getMultiBrandEnabledByTenant(ownerTenantId),
          estado: 'activo',
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/admin/restaurants', error);

    return NextResponse.json(
      { error: 'No se pudo crear el restaurante.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(req, auth.session);
  const ownerTenantId = access.tenantId;

  try {
    const restaurantId = normalizeNonEmptyString(
      req.nextUrl.searchParams.get('restaurantId') ??
        req.nextUrl.searchParams.get('restaurant_id') ??
        req.nextUrl.searchParams.get('id')
    );

    const restaurantSlug = normalizeSlug(
      req.nextUrl.searchParams.get('slug') ??
        req.nextUrl.searchParams.get('restaurant')
    );

    if (!restaurantId && !restaurantSlug) {
      return NextResponse.json(
        { error: 'Falta indicar el restaurante a cerrar.' },
        { status: 400 }
      );
    }

    let restaurantQuery = supabaseAdmin
      .from('restaurants')
      .select('id, slug, owner_tenant_id, estado')
      .limit(1);

    if (restaurantId) {
      restaurantQuery = restaurantQuery.eq('id', restaurantId);
    } else {
      restaurantQuery = restaurantQuery.eq('slug', restaurantSlug);
    }

    const { data: restaurant, error: restaurantError } =
      await restaurantQuery.maybeSingle();

    if (restaurantError) throw restaurantError;

    if (!restaurant?.id || restaurant.owner_tenant_id !== ownerTenantId) {
      return NextResponse.json(
        { error: 'Restaurante no encontrado.' },
        { status: 404 }
      );
    }

    if (restaurant.estado === 'cerrado') {
      return NextResponse.json({
        ok: true,
        mode: 'already_closed',
        id: String(restaurant.id),
        slug: restaurant.slug,
        message: 'El restaurante ya estaba cerrado.',
      });
    }

    const cerradoEn = new Date().toISOString();

const { error: closeError } = await supabaseAdmin
  .from('restaurants')
  .update({
    estado: 'cerrado',
    cerrado_en: cerradoEn,
    cerrado_motivo: 'Cerrado desde administración',
  })
  .eq('id', restaurant.id)
  .eq('owner_tenant_id', ownerTenantId);

if (closeError) throw closeError;

return NextResponse.json({
  ok: true,
  mode: 'closed',
  id: String(restaurant.id),
  slug: restaurant.slug,
  cerrado_en: cerradoEn,
  message:
    'El restaurante fue cerrado y archivado. Conserva su configuración e historial, no recibe nuevos pedidos y no cuenta como restaurante activo.',
});
    }

    await supabaseAdmin
      .from('configuracion_local')
      .delete()
      .eq('restaurant_id', restaurant.id);

    const { error: deleteError } = await supabaseAdmin
      .from('restaurants')
      .delete()
      .eq('id', restaurant.id)
      .eq('owner_tenant_id', ownerTenantId);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      ok: true,
      mode: 'deleted',
      id: String(restaurant.id),
      slug: restaurant.slug,
      message:
        'El restaurante no tenía historial operativo y fue eliminado definitivamente.',
    });
  } catch (error) {
    const message = getUnknownErrorMessage(error);

    console.error('DELETE /api/admin/restaurants', error);

    return NextResponse.json(
      {
        error: `No se pudo cerrar el restaurante. Detalle: ${message}`,
      },
      { status: 500 }
    );
  }
}
