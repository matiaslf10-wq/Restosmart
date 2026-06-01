import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  type AddonKey,
  type BusinessMode,
  type CapabilityMap,
  type FeatureKey,
  type PlanCode,
  getCapabilityMap,
  getFeaturesForContext,
  normalizeBusinessMode,
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

type TenantSubscriptionStatus =
  | 'active'
  | 'pending_payment'
  | 'payment_failed'
  | 'cancelled';

type TenantSubscriptionRow = {
  tenant_id: string | null;
  plan: string | null;
  status: TenantSubscriptionStatus | string | null;
};

type LocalConfigRow = {
  business_mode: string | null;
};

export type AdminAccessSnapshot = {
  tenantId: string;
  plan: PlanCode;
  subscription: {
    plan: PlanCode;
    status: TenantSubscriptionStatus;
  };
  businessMode: BusinessMode;
  restaurant: {
    id: string;
    slug: string;
    plan: PlanCode;
    businessMode: BusinessMode;
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
  const businessMode: BusinessMode = 'restaurant';
  const addons = getDefaultAddons();

  return {
  tenantId: DEFAULT_TENANT_ID,
  plan,
  subscription: {
    plan,
    status: 'active',
  },
  businessMode,
    restaurant: null,
    addons,
    features: getFeaturesForContext(plan, businessMode),
    capabilities: getCapabilityMap(plan, addons, businessMode),
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

function normalizeSubscriptionStatus(
  value: unknown
): TenantSubscriptionStatus {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (normalized === 'pending_payment') return 'pending_payment';
  if (normalized === 'payment_failed') return 'payment_failed';
  if (normalized === 'cancelled') return 'cancelled';

  return 'active';
}

async function resolveTenantSubscription(params: {
  tenantId: string;
  fallbackRestaurant: RestaurantRow | null;
}) {
  const { tenantId, fallbackRestaurant } = params;

  const { data, error } = await supabaseAdmin
    .from('tenant_subscriptions')
    .select('tenant_id, plan, status')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    console.error('No se pudo leer tenant_subscriptions:', error);
  }

  const subscription = (data ?? null) as TenantSubscriptionRow | null;

  const fallbackOwner = await getRestaurantBySlug(tenantId).catch(() => null);

  const subscriptionPlan = normalizePlan(
    subscription?.plan ?? fallbackOwner?.plan ?? fallbackRestaurant?.plan
  );

  const subscriptionStatus = normalizeSubscriptionStatus(
    subscription?.status ?? 'active'
  );

  const effectivePlan =
    subscriptionStatus === 'active' ? subscriptionPlan : 'esencial';

  return {
    plan: effectivePlan,
    subscriptionPlan,
    subscriptionStatus,
  };
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

async function getBusinessModeByRestaurantId(
  restaurantId: string | null
): Promise<BusinessMode> {
  if (!restaurantId) {
    return 'restaurant';
  }

  const result = await supabaseAdmin
    .from('configuracion_local')
    .select('business_mode')
    .eq('restaurant_id', restaurantId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    console.error(
      'No se pudo leer business_mode desde configuracion_local:',
      result.error
    );

    return 'restaurant';
  }

  const row = (result.data as LocalConfigRow | null) ?? null;

  return normalizeBusinessMode(row?.business_mode);
}

export async function resolveAdminAccess(
  options: AdminAccessResolutionOptions = {}
): Promise<AdminAccessSnapshot> {
  const restaurant = await resolveRestaurant(options);
  const requestedTenantSlug = normalizeNonEmptyString(options.tenantSlug);
  const tenantId = getTenantIdFromRestaurant(restaurant, requestedTenantSlug);

  const subscription = await resolveTenantSubscription({
  tenantId,
  fallbackRestaurant: restaurant,
});

const plan = subscription.plan;

  const restaurantId = restaurant?.id == null ? null : String(restaurant.id);

  const [businessMode, connection, tenantAddons] = await Promise.all([
    getBusinessModeByRestaurantId(restaurantId),
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
  subscription: {
    plan: subscription.subscriptionPlan,
    status: subscription.subscriptionStatus,
  },
  businessMode,
    restaurant: restaurant
      ? {
          id: String(restaurant.id),
          slug: restaurant.slug?.trim() || tenantId,
          plan,
          businessMode,
          owner_tenant_id: restaurant.owner_tenant_id ?? tenantId,
          estado: restaurant.estado ?? 'activo',
        }
      : null,
    addons,
    features: getFeaturesForContext(plan, businessMode),
    capabilities: getCapabilityMap(plan, addons, businessMode),
  };
}