import 'server-only';

import { headers } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type RestaurantStatus = 'activo' | 'pausado' | 'cerrado';

export type RestaurantContext = {
  id: string | number;
  slug: string;
  plan?: string | null;
  owner_tenant_id?: string | null;
  estado?: RestaurantStatus | string | null;
};

function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function normalizeHost(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

function normalizeNonEmptyString(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

export async function getTenantSlugFromHeaders() {
  const h = await headers();

  const explicitTenant =
    normalizeNonEmptyString(h.get('x-tenant')) ??
    normalizeNonEmptyString(h.get('x-tenant-id')) ??
    normalizeNonEmptyString(h.get('x-tenant-slug'));

  if (explicitTenant) {
    return explicitTenant;
  }

  const host = normalizeHost(h.get('x-forwarded-host') || h.get('host'));
  const rootDomain = normalizeHost(process.env.NEXT_PUBLIC_ROOT_DOMAIN);

  if (
    host &&
    rootDomain &&
    host !== rootDomain &&
    host.endsWith(`.${rootDomain}`)
  ) {
    const subdomain = host.slice(0, host.length - rootDomain.length - 1).trim();

    if (subdomain && subdomain !== 'www') {
      return subdomain;
    }
  }

  const defaultTenantId = process.env.DEFAULT_TENANT_ID?.trim();

  if (defaultTenantId) {
    return defaultTenantId;
  }

  return null;
}

async function getRestaurantBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<RestaurantContext | null> {
  const result = await supabase
    .from('restaurants')
    .select('id, slug, plan, owner_tenant_id, estado')
    .eq('slug', slug)
    .maybeSingle();

  if (!result.error && result.data?.id) {
    return result.data as RestaurantContext;
  }

  return null;
}

async function getRestaurantById(
  supabase: SupabaseClient,
  id: string
): Promise<RestaurantContext | null> {
  const result = await supabase
    .from('restaurants')
    .select('id, slug, plan, owner_tenant_id, estado')
    .eq('id', id)
    .maybeSingle();

  if (!result.error && result.data?.id) {
    return result.data as RestaurantContext;
  }

  return null;
}

async function resolveTenantPlan(
  supabase: SupabaseClient,
  restaurant: RestaurantContext
) {
  const ownerTenantId =
    normalizeNonEmptyString(restaurant.owner_tenant_id) ??
    normalizeNonEmptyString(restaurant.slug);

  if (!ownerTenantId) {
    return restaurant.plan ?? null;
  }

  const owner = await getRestaurantBySlug(supabase, ownerTenantId);

  return owner?.plan ?? restaurant.plan ?? null;
}

async function withTenantPlan(
  supabase: SupabaseClient,
  restaurant: RestaurantContext
): Promise<RestaurantContext> {
  const plan = await resolveTenantPlan(supabase, restaurant);

  return {
    ...restaurant,
    plan,
    owner_tenant_id:
      normalizeNonEmptyString(restaurant.owner_tenant_id) ??
      normalizeNonEmptyString(restaurant.slug),
    estado: restaurant.estado ?? 'activo',
  };
}

export async function resolveRestaurantContext(
  supabase: SupabaseClient = createServiceRoleClient()
) {
  const tenantSlug = await getTenantSlugFromHeaders();

  if (tenantSlug) {
    const bySlug = await getRestaurantBySlug(supabase, tenantSlug);

    if (bySlug?.id) {
      return await withTenantPlan(supabase, bySlug);
    }

    const byId = await getRestaurantById(supabase, tenantSlug);

    if (byId?.id) {
      return await withTenantPlan(supabase, byId);
    }
  }

  const defaultTenantId = process.env.DEFAULT_TENANT_ID?.trim();

  if (defaultTenantId && defaultTenantId !== tenantSlug) {
    const byDefaultSlug = await getRestaurantBySlug(supabase, defaultTenantId);

    if (byDefaultSlug?.id) {
      return await withTenantPlan(supabase, byDefaultSlug);
    }
  }

  const fallback = await supabase
    .from('restaurants')
    .select('id, slug, plan, owner_tenant_id, estado')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!fallback.error && fallback.data?.id) {
    return await withTenantPlan(supabase, fallback.data as RestaurantContext);
  }

  return null;
}

export async function getRestaurantContext() {
  return resolveRestaurantContext();
}