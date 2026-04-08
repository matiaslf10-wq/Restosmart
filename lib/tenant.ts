import 'server-only';

import { headers } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type RestaurantContext = {
  id: string | number;
  slug: string;
  plan?: string | null;
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

export async function getTenantSlugFromHeaders() {
  const h = await headers();

  const explicitTenant = h.get('x-tenant')?.trim();
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

export async function resolveRestaurantContext(
  supabase: SupabaseClient = createServiceRoleClient()
) {
  const tenantSlug = await getTenantSlugFromHeaders();

  if (tenantSlug) {
    const bySlug = await supabase
      .from('restaurants')
      .select('id, slug, plan')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (!bySlug.error && bySlug.data?.id) {
      return bySlug.data as RestaurantContext;
    }
  }

  const defaultTenantId = process.env.DEFAULT_TENANT_ID?.trim();

  if (defaultTenantId && defaultTenantId !== tenantSlug) {
    const byDefaultSlug = await supabase
      .from('restaurants')
      .select('id, slug, plan')
      .eq('slug', defaultTenantId)
      .maybeSingle();

    if (!byDefaultSlug.error && byDefaultSlug.data?.id) {
      return byDefaultSlug.data as RestaurantContext;
    }
  }

  const fallback = await supabase
    .from('restaurants')
    .select('id, slug, plan')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!fallback.error && fallback.data?.id) {
    return fallback.data as RestaurantContext;
  }

  return null;
}

export async function getRestaurantContext() {
  return resolveRestaurantContext();
}