import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  type AddonKey,
  type CapabilityMap,
  type FeatureKey,
  type PlanCode,
  getCapabilityMap,
  getFeaturesForPlan,
  normalizePlan,
} from '@/lib/plans';

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID?.trim() || 'default';

type RestaurantStatus = 'activo' | 'pausado' | 'cerrado';

type RestaurantRow = {
  id: string | number;
  slug: string | null;
  plan: string | null;
  owner_tenant_id?: string | null;
  estado?: RestaurantStatus | string | null;
};

type WhatsAppConnectionRow = {
  tenant_id: string | null;
  add_on_enabled: boolean | null;
};

type TenantAddonRow = {
  addon_key: string | null;
  enabled: boolean | null;
};

export type AdminAccessSnapshot = {
  tenantId: string;
  plan: PlanCode;
  restaurant: {
    id: string;
    slug: string;
    plan: PlanCode;
    owner_tenant_id?: string | null;
    estado?: RestaurantStatus | string | null;
  } | null;
  addons: Record<AddonKey, boolean>;
  features: FeatureKey[];
  capabilities: CapabilityMap;
};

export type AdminAccessResolutionOptions = {
  tenantSlug?: string | null;
  restaurantId?: string | null;
};

function normalizeNonEmptyString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function getTenantIdFromRestaurant(
  restaurant: RestaurantRow | null,
  requestedTenantSlug?: string | null
) {
  return (
    normalizeNonEmptyString(restaurant?.owner_tenant_id) ??
    normalizeNonEmptyString(restaurant?.slug) ??
    normalizeNonEmptyString(requestedTenantSlug) ??
    DEFAULT_TENANT_ID
  );
}

function getDefaultAddons(): Record<AddonKey, boolean> {
  return {
    whatsapp_delivery: false,
    multi_brand: false,
  };
}

export function getFallbackAdminAccess(): AdminAccessSnapshot {
  const plan: PlanCode = 'esencial';
  const addons = getDefaultAddons();

  return {
    tenantId: DEFAULT_TENANT_ID,
    plan,
    restaurant: null,
    addons,
    features: getFeaturesForPlan(plan),
    capabilities: getCapabilityMap(plan, addons),
  };
}

async function getRestaurantBySlug(slug: string) {
  const result = await supabaseAdmin
    .from('restaurants')
    .select('id, slug, plan, owner_tenant_id, estado')
    .eq('slug', slug)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      result.error.message || `No se pudo leer el restaurant por slug "${slug}".`
    );
  }

  return (result.data as RestaurantRow | null) ?? null;
}

async function getRestaurantById(restaurantId: string) {
  const result = await supabaseAdmin
    .from('restaurants')
    .select('id, slug, plan, owner_tenant_id, estado')
    .eq('id', restaurantId)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      result.error.message ||
        `No se pudo leer el restaurant por id "${restaurantId}".`
    );
  }

  return (result.data as RestaurantRow | null) ?? null;
}

async function getFirstRestaurant() {
  const result = await supabaseAdmin
    .from('restaurants')
    .select('id, slug, plan, owner_tenant_id, estado')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      result.error.message || 'No se pudo leer el primer restaurant.'
    );
  }

  return (result.data as RestaurantRow | null) ?? null;
}

async function resolveRestaurant(
  options: AdminAccessResolutionOptions = {}
): Promise<RestaurantRow | null> {
  const requestedRestaurantId = normalizeNonEmptyString(options.restaurantId);
  const requestedTenantSlug = normalizeNonEmptyString(options.tenantSlug);

  if (requestedRestaurantId) {
    const byId = await getRestaurantById(requestedRestaurantId);
    if (byId) return byId;
  }

  if (requestedTenantSlug) {
    const bySlug = await getRestaurantBySlug(requestedTenantSlug);
    if (bySlug) return bySlug;
  }

  if (DEFAULT_TENANT_ID) {
    const byDefaultSlug = await getRestaurantBySlug(DEFAULT_TENANT_ID);
    if (byDefaultSlug) return byDefaultSlug;
  }

  return await getFirstRestaurant();
}

async function resolveTenantPlan(params: {
  tenantId: string;
  fallbackRestaurant: RestaurantRow | null;
}) {
  const { tenantId, fallbackRestaurant } = params;

  const owner = await getRestaurantBySlug(tenantId).catch(() => null);

  return normalizePlan(owner?.plan ?? fallbackRestaurant?.plan);
}

async function getWhatsAppConnectionByTenantId(tenantId: string) {
  const result = await supabaseAdmin
    .from('whatsapp_connections')
    .select('tenant_id, add_on_enabled')
    .eq('tenant_id', tenantId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      result.error.message || 'No se pudo leer la conexión de WhatsApp.'
    );
  }

  return (result.data as WhatsAppConnectionRow | null) ?? null;
}

async function getTenantAddonsByTenantId(tenantId: string) {
  const addons = getDefaultAddons();

  const result = await supabaseAdmin
    .from('tenant_addons')
    .select('addon_key, enabled')
    .eq('tenant_id', tenantId);

  if (result.error) {
    console.error('No se pudieron leer los add-ons del tenant:', result.error);
    return addons;
  }

  const rows = (result.data as TenantAddonRow[]) ?? [];

  for (const row of rows) {
    if (row.addon_key === 'multi_brand') {
      addons.multi_brand = row.enabled === true;
    }

    if (row.addon_key === 'whatsapp_delivery') {
      addons.whatsapp_delivery = row.enabled === true;
    }
  }

  return addons;
}

export async function resolveAdminAccess(
  options: AdminAccessResolutionOptions = {}
): Promise<AdminAccessSnapshot> {
  const restaurant = await resolveRestaurant(options);
  const requestedTenantSlug = normalizeNonEmptyString(options.tenantSlug);
  const tenantId = getTenantIdFromRestaurant(restaurant, requestedTenantSlug);
  const plan = await resolveTenantPlan({
    tenantId,
    fallbackRestaurant: restaurant,
  });

  const [connection, tenantAddons] = await Promise.all([
    getWhatsAppConnectionByTenantId(tenantId),
    getTenantAddonsByTenantId(tenantId),
  ]);

  const addons: Record<AddonKey, boolean> = {
    ...tenantAddons,
    whatsapp_delivery:
      tenantAddons.whatsapp_delivery || !!connection?.add_on_enabled,
  };

  return {
    tenantId,
    plan,
    restaurant: restaurant
      ? {
          id: String(restaurant.id),
          slug: restaurant.slug?.trim() || tenantId,
          plan,
          owner_tenant_id: restaurant.owner_tenant_id ?? tenantId,
          estado: restaurant.estado ?? 'activo',
        }
      : null,
    addons,
    features: getFeaturesForPlan(plan),
    capabilities: getCapabilityMap(plan, addons),
  };
}