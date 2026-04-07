export type PlanCode = 'esencial' | 'pro' | 'intelligence';

export type FeatureKey =
  | 'products'
  | 'categories'
  | 'digital_menu'
  | 'table_qr'
  | 'table_ordering'
  | 'table_checkout'
  | 'kitchen_board'
  | 'operations_basic'
  | 'settings_basic'
  | 'waiter_mode'
  | 'operations_advanced'
  | 'analytics_advanced'
  | 'analytics_executive';

export type AddonKey = 'whatsapp_delivery';

export type CapabilityMap = {
  analytics: boolean;
  delivery: boolean;
  waiter_mode: boolean;
};

export const PLAN_FEATURES: Record<PlanCode, FeatureKey[]> = {
  esencial: [
    'products',
    'categories',
    'digital_menu',
    'table_qr',
    'table_ordering',
    'table_checkout',
    'kitchen_board',
    'operations_basic',
    'settings_basic',
  ],
  pro: [
    'products',
    'categories',
    'digital_menu',
    'table_qr',
    'table_ordering',
    'table_checkout',
    'kitchen_board',
    'operations_basic',
    'settings_basic',
    'waiter_mode',
    'operations_advanced',
  ],
  intelligence: [
    'products',
    'categories',
    'digital_menu',
    'table_qr',
    'table_ordering',
    'table_checkout',
    'kitchen_board',
    'operations_basic',
    'settings_basic',
    'waiter_mode',
    'operations_advanced',
    'analytics_advanced',
    'analytics_executive',
  ],
};

export function normalizePlan(value: unknown): PlanCode {
  const raw = String(value ?? '').trim().toLowerCase();

  if (raw === 'pro') return 'pro';
  if (raw === 'intelligence') return 'intelligence';
  return 'esencial';
}

export function getFeaturesForPlan(plan: PlanCode): FeatureKey[] {
  return [...PLAN_FEATURES[plan]];
}

export function hasFeature(plan: PlanCode, feature: FeatureKey): boolean {
  return PLAN_FEATURES[plan].includes(feature);
}

export function hasAddon(
  addons: Partial<Record<AddonKey, boolean>> | null | undefined,
  addon: AddonKey
): boolean {
  return !!addons?.[addon];
}

export function getCapabilityMap(
  plan: PlanCode,
  addons: Partial<Record<AddonKey, boolean>> | null | undefined
): CapabilityMap {
  return {
    analytics: hasFeature(plan, 'analytics_advanced'),
    delivery: hasAddon(addons, 'whatsapp_delivery'),
    waiter_mode: hasFeature(plan, 'waiter_mode'),
  };
}

export function formatPlanLabel(plan: PlanCode) {
  switch (plan) {
    case 'pro':
      return 'Pro';
    case 'intelligence':
      return 'Intelligence';
    case 'esencial':
    default:
      return 'Esencial';
  }
}