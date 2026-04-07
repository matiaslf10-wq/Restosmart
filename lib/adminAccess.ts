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

export function getFallbackAdminAccess(): AdminAccessSnapshot {
  const plan: PlanCode = 'esencial';
  const addons: Record<AddonKey, boolean> = {
    whatsapp_delivery: false,
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

async function getRestaurantByDefaultTenantOrFirst() {
  const bySlug = await supabaseAdmin
    .from('restaurants')
    .select('id, slug, plan')
    .eq('slug', DEFAULT_TENANT_ID)
    .maybeSingle();

  if (bySlug.error) {
    throw new Error(
      bySlug.error.message || 'No se pudo leer el restaurant por slug.'
    );
  }

  if (bySlug.data) {
    return bySlug.data as RestaurantRow;
  }

  const first = await supabaseAdmin
    .from('restaurants')
    .select('id, slug, plan')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (first.error) {
    throw new Error(
      first.error.message || 'No se pudo leer el restaurant por defecto.'
    );
  }

  return (first.data as RestaurantRow | null) ?? null;
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

export async function resolveAdminAccess(): Promise<AdminAccessSnapshot> {
  const restaurant = await getRestaurantByDefaultTenantOrFirst();
  const plan = normalizePlan(restaurant?.plan);
  const tenantId = restaurant?.slug?.trim() || DEFAULT_TENANT_ID;

  const connection = await getWhatsAppConnectionByTenantId(tenantId);

  const addons: Record<AddonKey, boolean> = {
    whatsapp_delivery: !!connection?.add_on_enabled,
  };

  return {
    tenantId,
    plan,
    restaurant: restaurant
      ? {
          id: String(restaurant.id),
          slug: tenantId,
          plan,
        }
      : null,
    addons,
    features: getFeaturesForPlan(plan),
    capabilities: getCapabilityMap(plan, addons),
  };
}