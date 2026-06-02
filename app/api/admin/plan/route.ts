import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { getFallbackAdminAccess, resolveAdminAccess } from '@/lib/adminAccess';
import { type PlanCode } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PlanUpdateBody = {
  plan?: string;
  tenantSlug?: string;
  restaurantId?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
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

function isPlanCode(value: unknown): value is PlanCode {
  return value === 'esencial' || value === 'pro' || value === 'intelligence';
}

function extractRequestedTenantContext(request: NextRequest, session: unknown) {
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
    console.error('GET /api/admin/plan access resolution error:', error);
  }

  return NextResponse.json({
    ok: true,
    tenantId: access.tenantId,
    plan: access.plan,
    restaurant: access.restaurant,
    addons: access.addons,
    capabilities: access.capabilities,
  });
}

export async function PUT(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  let body: PlanUpdateBody | null = null;

  try {
    body = (await request.json()) as PlanUpdateBody;
  } catch {
    body = null;
  }

  const requestedContextFromSession = extractRequestedTenantContext(
    request,
    auth.session
  );

  const requestedContext = {
    tenantSlug:
      normalizeNonEmptyString(body?.tenantSlug) ??
      requestedContextFromSession.tenantSlug,
    restaurantId:
      normalizeNonEmptyString(body?.restaurantId) ??
      requestedContextFromSession.restaurantId,
  };

  const requestedPlanRaw = String(body?.plan ?? '').trim().toLowerCase();

  if (!isPlanCode(requestedPlanRaw)) {
    return NextResponse.json(
      { error: 'Plan inválido. Usá esencial, pro o intelligence.' },
      { status: 400 }
    );
  }

  let access = getFallbackAdminAccess();

  try {
    access = await resolveAdminAccess(requestedContext);
  } catch (error) {
    console.error('PUT /api/admin/plan access resolution error:', error);
    return NextResponse.json(
      { error: 'No se pudo resolver el tenant actual.' },
      { status: 500 }
    );
  }

  const requestedPlan = requestedPlanRaw as PlanCode;

  if (requestedPlan === access.plan) {
    return NextResponse.json({
      ok: true,
      mode: 'no_change',
      tenantId: access.tenantId,
      plan: access.plan,
      message: 'El tenant ya tiene ese plan activo.',
    });
  }

  return NextResponse.json(
    {
      ok: false,
      checkout_required: true,
      error:
        'El cambio de plan requiere activación comercial y cobro. No se puede modificar el plan directamente desde esta API.',
      current_plan: access.plan,
      requested_plan: requestedPlan,
      tenantId: access.tenantId,
    },
    { status: 402 }
  );
}