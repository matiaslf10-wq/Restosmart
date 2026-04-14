import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  getFallbackAdminAccess,
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
} from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  formatBusinessModeLabel,
  getFeaturesForContext,
  normalizeBusinessMode,
  type BusinessMode,
} from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PublicOrderingMeta = {
  business_mode_label: string;
  customer_entry_kind: 'restaurant' | 'takeaway';
  customer_entry_strategy:
    | 'table_qr_route'
    | 'separate_public_route_required';
  current_customer_entry_path: string | null;
  planned_customer_entry_path: string | null;
  takeaway_ready_screen_path: string | null;
  table_qr_enabled: boolean;
  takeaway_enabled: boolean;
};

type BusinessModeRow = {
  business_mode?: string | null;
};

function getPublicOrderingMeta(businessMode: BusinessMode): PublicOrderingMeta {
  if (businessMode === 'takeaway') {
    return {
      business_mode_label: formatBusinessModeLabel(businessMode),
      customer_entry_kind: 'takeaway',
      customer_entry_strategy: 'separate_public_route_required',
      current_customer_entry_path: '/pedir',
      planned_customer_entry_path: null,
      takeaway_ready_screen_path: '/retiro',
      table_qr_enabled: false,
      takeaway_enabled: true,
    };
  }

  return {
    business_mode_label: formatBusinessModeLabel(businessMode),
    customer_entry_kind: 'restaurant',
    customer_entry_strategy: 'table_qr_route',
    current_customer_entry_path: '/mesa/[id]',
    planned_customer_entry_path: '/pedir',
    takeaway_ready_screen_path: '/retiro',
    table_qr_enabled: true,
    takeaway_enabled: true,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeNonEmptyString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeNonEmptyString(value);
    if (normalized) return normalized;
  }

  return null;
}

function extractRequestedTenantContext(
  request: NextRequest,
  session: unknown
): AdminAccessResolutionOptions {
  const sessionRecord = asRecord(session);
  const restaurantRecord = asRecord(sessionRecord?.restaurant);

  const tenantSlug = pickFirstString(
    request.nextUrl.searchParams.get('tenant'),
    request.nextUrl.searchParams.get('tenantSlug'),
    request.nextUrl.searchParams.get('slug'),
    request.headers.get('x-tenant-id'),
    request.headers.get('x-tenant-slug'),
    request.cookies.get('tenant')?.value,
    request.cookies.get('tenant_slug')?.value,
    restaurantRecord?.slug,
    sessionRecord?.tenantId,
    sessionRecord?.tenant_id,
    sessionRecord?.slug
  );

  const restaurantId = pickFirstString(
    request.nextUrl.searchParams.get('restaurantId'),
    request.nextUrl.searchParams.get('restaurant_id'),
    request.headers.get('x-restaurant-id'),
    request.cookies.get('restaurant_id')?.value,
    restaurantRecord?.id,
    sessionRecord?.restaurantId,
    sessionRecord?.restaurant_id
  );

  return {
    tenantSlug,
    restaurantId,
  };
}

async function tryReadBusinessModeByRestaurantId(restaurantId: string | null) {
  if (!restaurantId) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('configuracion_local')
      .select('business_mode')
      .eq('restaurant_id', restaurantId)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        'GET /api/admin/session business_mode by restaurant_id read error:',
        error
      );
      return null;
    }

    return normalizeBusinessMode((data as BusinessModeRow | null)?.business_mode);
  } catch (error) {
    console.error(
      'GET /api/admin/session business_mode by restaurant_id unexpected error:',
      error
    );
    return null;
  }
}

async function tryReadBusinessModeByTenantId(tenantSlug: string | null) {
  if (!tenantSlug) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('configuracion_local')
      .select('business_mode')
      .eq('tenant_id', tenantSlug)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        'GET /api/admin/session business_mode by tenant_id read error:',
        error
      );
      return null;
    }

    return normalizeBusinessMode((data as BusinessModeRow | null)?.business_mode);
  } catch (error) {
    console.error(
      'GET /api/admin/session business_mode by tenant_id unexpected error:',
      error
    );
    return null;
  }
}

async function tryReadBusinessModeBySlug(tenantSlug: string | null) {
  if (!tenantSlug) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('configuracion_local')
      .select('business_mode')
      .eq('slug', tenantSlug)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        'GET /api/admin/session business_mode by slug read error:',
        error
      );
      return null;
    }

    return normalizeBusinessMode((data as BusinessModeRow | null)?.business_mode);
  } catch (error) {
    console.error(
      'GET /api/admin/session business_mode by slug unexpected error:',
      error
    );
    return null;
  }
}

async function readFallbackBusinessMode() {
  try {
    const { data, error } = await supabaseAdmin
      .from('configuracion_local')
      .select('business_mode')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('GET /api/admin/session business_mode fallback read error:', error);
      return normalizeBusinessMode(undefined);
    }

    return normalizeBusinessMode((data as BusinessModeRow | null)?.business_mode);
  } catch (error) {
    console.error(
      'GET /api/admin/session business_mode fallback unexpected error:',
      error
    );
    return normalizeBusinessMode(undefined);
  }
}

async function resolveBusinessModeContext(
  options: AdminAccessResolutionOptions
): Promise<BusinessMode> {
  const byRestaurantId = await tryReadBusinessModeByRestaurantId(
    options.restaurantId ?? null
  );
  if (byRestaurantId) return byRestaurantId;

  const byTenantId = await tryReadBusinessModeByTenantId(
    options.tenantSlug ?? null
  );
  if (byTenantId) return byTenantId;

  const bySlug = await tryReadBusinessModeBySlug(options.tenantSlug ?? null);
  if (bySlug) return bySlug;

  return await readFallbackBusinessMode();
}

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const requestedContext = extractRequestedTenantContext(request, auth.session);

  let access = getFallbackAdminAccess();

  try {
    access = await resolveAdminAccess(requestedContext);
  } catch (error) {
    console.error('GET /api/admin/session access resolution error:', error);
  }

  const businessMode = await resolveBusinessModeContext({
    tenantSlug: access.restaurant?.slug ?? requestedContext.tenantSlug ?? null,
    restaurantId: access.restaurant?.id ?? requestedContext.restaurantId ?? null,
  });

  const publicOrdering = getPublicOrderingMeta(businessMode);
  const features = getFeaturesForContext(access.plan, businessMode);
  const capabilities = {
    ...access.capabilities,
    waiter_mode:
      businessMode === 'restaurant' && !!access.capabilities?.waiter_mode,
  };

  return NextResponse.json(
    {
      ok: true,
      session: {
        ...auth.session,
        tenantId: access.tenantId,
        restaurant: access.restaurant
          ? {
              ...access.restaurant,
              business_mode: businessMode,
            }
          : access.restaurant,
        plan: access.plan,
        addons: access.addons,
        features,
        capabilities,
        business_mode: businessMode,
        public_ordering: publicOrdering,
      },
    },
    { status: 200 }
  );
}