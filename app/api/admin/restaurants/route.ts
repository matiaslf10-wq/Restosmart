import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  normalizeBusinessMode,
  normalizePlan,
  type BusinessMode,
  type PlanCode,
} from '@/lib/plans';

type RestaurantRow = {
  id: string | number;
  slug: string | null;
  plan: string | null;
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

  try {
    const { data: restaurantsData, error: restaurantsError } =
      await supabaseAdmin
        .from('restaurants')
        .select('id, slug, plan')
        .order('slug', { ascending: true });

    if (restaurantsError) throw restaurantsError;

    const restaurants = ((restaurantsData ?? []) as RestaurantRow[]).filter(
      (row) => !!row.slug
    );

    const restaurantIds = restaurants.map((row) => row.id);
    const slugs = restaurants
      .map((row) => row.slug)
      .filter((slug): slug is string => !!slug);

    const [configsResult, addonsResult] = await Promise.all([
      restaurantIds.length > 0
        ? supabaseAdmin
            .from('configuracion_local')
            .select(
              'restaurant_id, nombre_local, direccion, telefono, celular, email, horario_atencion, business_mode'
            )
            .in('restaurant_id', restaurantIds)
        : Promise.resolve({ data: [], error: null }),
      slugs.length > 0
        ? supabaseAdmin
            .from('tenant_addons')
            .select('tenant_id, addon_key, enabled')
            .in('tenant_id', slugs)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (configsResult.error) throw configsResult.error;
    if (addonsResult.error) throw addonsResult.error;

    const configs = (configsResult.data ?? []) as LocalConfigRow[];
const addons = (addonsResult.data ?? []) as TenantAddonRow[];

    const configByRestaurantId = new Map(
      configs.map((config) => [String(config.restaurant_id), config])
    );

    const multiBrandBySlug = new Map<string, boolean>();

    for (const addon of addons) {
      if (addon.tenant_id && addon.addon_key === 'multi_brand') {
        multiBrandBySlug.set(addon.tenant_id, addon.enabled === true);
      }
    }

    const items = restaurants.map((restaurant) => {
      const slug = restaurant.slug ?? '';
      const config = configByRestaurantId.get(String(restaurant.id)) ?? null;

      return {
        id: String(restaurant.id),
        slug,
        plan: normalizePlan(restaurant.plan),
        nombre_local: config?.nombre_local ?? '',
        direccion: config?.direccion ?? '',
        telefono: config?.telefono ?? '',
        celular: config?.celular ?? '',
        email: config?.email ?? '',
        horario_atencion: config?.horario_atencion ?? '',
        business_mode: normalizeBusinessMode(config?.business_mode),
        multi_brand: multiBrandBySlug.get(slug) === true,
      };
    });

    return NextResponse.json({ items });
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

  try {
    const body = await req.json().catch(() => null);

    const nombreLocal = normalizeNonEmptyString(body?.nombre_local);
    const slug = normalizeSlug(body?.slug ?? nombreLocal);
    const plan = normalizePlan(body?.plan) as PlanCode;
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
        plan,
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

    await setMultiBrandEnabled(slug, multiBrand);

    return NextResponse.json(
      {
        ok: true,
        restaurant: {
          id: String(restaurant.id),
          slug,
          plan,
          nombre_local: nombreLocal,
          direccion: normalizeNonEmptyString(body?.direccion) ?? '',
          telefono: normalizeNonEmptyString(body?.telefono) ?? '',
          celular: normalizeNonEmptyString(body?.celular) ?? '',
          email: normalizeNonEmptyString(body?.email) ?? '',
          horario_atencion:
            normalizeNonEmptyString(body?.horario_atencion) ?? '',
          business_mode: businessMode,
          multi_brand: await getMultiBrandEnabledByTenant(slug),
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