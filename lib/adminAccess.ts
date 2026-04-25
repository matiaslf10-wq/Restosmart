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

type RestaurantRow = {
  id: string | number;
  slug: string | null;
  plan: string | null;
};

type WhatsAppConnectionRow = {
  tenant_id: string | null;
  add_on_enabled: boolean | null;
};

export type AdminAccessSnapshot = {
  tenantId: string;
  plan: PlanCode;
  restaurant: {
    id: string;
    slug: string;
    plan: PlanCode;
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

export function getFallbackAdminAccess(): AdminAccessSnapshot {
  const plan: PlanCode = 'esencial';
  const addons: Record<AddonKey, boolean> = {
  whatsapp_delivery: false,
  multi_brand: false,
};

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
    .select('id, slug, plan')
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
    .select('id, slug, plan')
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
    .select('id, slug, plan')
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

export async function resolveAdminAccess(
  options: AdminAccessResolutionOptions = {}
): Promise<AdminAccessSnapshot> {
  const restaurant = await resolveRestaurant(options);
  const plan = normalizePlan(restaurant?.plan);

  const requestedTenantSlug = normalizeNonEmptyString(options.tenantSlug);
  const tenantId =
    restaurant?.slug?.trim() || requestedTenantSlug || DEFAULT_TENANT_ID;

  const connection = await getWhatsAppConnectionByTenantId(tenantId);

  const addons: Record<AddonKey, boolean> = {
  whatsapp_delivery: !!connection?.add_on_enabled,
  multi_brand: false,
};

  return {
    tenantId,
    plan,
    restaurant: restaurant
      ? {
          id: String(restaurant.id),
          slug: restaurant.slug?.trim() || tenantId,
          plan,
        }
      : null,
    addons,
    features: getFeaturesForPlan(plan),
    capabilities: getCapabilityMap(plan, addons),
  };
}