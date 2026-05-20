import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  getFallbackAdminAccess,
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
} from '@/lib/adminAccess';
import {
  formatBusinessModeLabel,
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
    request.nextUrl.searchParams.get('restaurant'),
    request.nextUrl.searchParams.get('restaurantSlug'),
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

    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          error: 'No se pudo resolver el acceso del restaurante.',
        },
        { status: 500 }
      );
    }
  }

  const businessMode = access.businessMode;
  const publicOrdering = getPublicOrderingMeta(businessMode);

  return NextResponse.json(
    {
      ok: true,
      session: {
        ...auth.session,
        tenantId: access.tenantId,
        plan: access.plan,
        business_mode: businessMode,
        businessMode,
        addons: access.addons,
        features: access.features,
        capabilities: access.capabilities,
        public_ordering: publicOrdering,
        restaurant: access.restaurant
          ? {
              ...access.restaurant,
              business_mode: businessMode,
              businessMode,
            }
          : null,
      },
    },
    { status: 200 }
  );
}