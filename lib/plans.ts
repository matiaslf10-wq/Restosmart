export type PlanCode = 'esencial' | 'pro' | 'intelligence';
export type BusinessMode = 'restaurant' | 'takeaway';

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

const BUSINESS_MODE_DISABLED_FEATURES: Record<BusinessMode, FeatureKey[]> = {
  restaurant: [],
  takeaway: ['table_qr', 'table_ordering', 'table_checkout', 'waiter_mode'],
};

export function normalizePlan(value: unknown): PlanCode {
  const raw = String(value ?? '').trim().toLowerCase();

  if (raw === 'pro') return 'pro';
  if (raw === 'intelligence') return 'intelligence';
  return 'esencial';
}

export function normalizeBusinessMode(value: unknown): BusinessMode {
  const raw = String(value ?? '').trim().toLowerCase();

  if (raw === 'takeaway') return 'takeaway';
  return 'restaurant';
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

export function formatBusinessModeLabel(mode: BusinessMode) {
  switch (mode) {
    case 'takeaway':
      return 'Take Away';
    case 'restaurant':
    default:
      return 'Restaurante';
  }
}

export function getFeaturesForPlan(plan: PlanCode): FeatureKey[] {
  return [...PLAN_FEATURES[plan]];
}

export function getFeaturesForContext(
  plan: PlanCode,
  businessMode: BusinessMode
): FeatureKey[] {
  const disabled = BUSINESS_MODE_DISABLED_FEATURES[businessMode];

  return PLAN_FEATURES[plan].filter((feature) => !disabled.includes(feature));
}

export function hasFeature(plan: PlanCode, feature: FeatureKey): boolean {
  return PLAN_FEATURES[plan].includes(feature);
}

export function hasFeatureInContext(
  plan: PlanCode,
  businessMode: BusinessMode,
  feature: FeatureKey
): boolean {
  return getFeaturesForContext(plan, businessMode).includes(feature);
}

export function hasAddon(
  addons: Partial<Record<AddonKey, boolean>> | null | undefined,
  addon: AddonKey
): boolean {
  return !!addons?.[addon];
}

export function getCapabilityMap(
  plan: PlanCode,
  addons: Partial<Record<AddonKey, boolean>> | null | undefined,
  businessMode: BusinessMode = 'restaurant'
): CapabilityMap {
  return {
    analytics: hasFeature(plan, 'analytics_advanced'),
    delivery: hasAddon(addons, 'whatsapp_delivery'),
    waiter_mode:
      businessMode === 'restaurant' && hasFeature(plan, 'waiter_mode'),
  };
}