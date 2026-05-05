import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { getFallbackAdminAccess, resolveAdminAccess } from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizePlan, type PlanCode } from '@/lib/plans';

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

function getRestaurantLimitForPlan(plan: PlanCode) {
  if (plan === 'intelligence') return null;
  if (plan === 'pro') return 3;
  return 1;
}

function getActiveBrandLimitForPlan(plan: PlanCode) {
  if (plan === 'intelligence') return null;
  if (plan === 'pro') return 3;
  return 1;
}

async function resolveOwnerTenantId(access: Awaited<ReturnType<typeof resolveAdminAccess>>) {
  if (!access.restaurant?.id) {
    return access.tenantId;
  }

  const { data, error } = await supabaseAdmin
    .from('restaurants')
    .select('id, slug, owner_tenant_id')
    .eq('id', access.restaurant.id)
    .maybeSingle();

  if (error) {
    console.error('No se pudo resolver owner_tenant_id:', error);
    return access.tenantId;
  }

  return (
    normalizeNonEmptyString(data?.owner_tenant_id) ??
    normalizeNonEmptyString(data?.slug) ??
    access.tenantId
  );
}

async function countActiveRestaurants(ownerTenantId: string) {
  const { count, error } = await supabaseAdmin
    .from('restaurants')
    .select('id', { count: 'exact', head: true })
    .eq('owner_tenant_id', ownerTenantId)
    .eq('estado', 'activo');

  if (error) throw error;

  return count ?? 0;
}

async function countActiveBrands(ownerTenantId: string) {
  const { count, error } = await supabaseAdmin
    .from('marcas')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ownerTenantId)
    .eq('activa', true);

  if (error) throw error;

  return count ?? 0;
}

async function validateTenantPlanChange(params: {
  ownerTenantId: string;
  requestedPlan: PlanCode;
}) {
  const { ownerTenantId, requestedPlan } = params;

  const restaurantLimit = getRestaurantLimitForPlan(requestedPlan);
  const brandLimit = getActiveBrandLimitForPlan(requestedPlan);

  const [activeRestaurants, activeBrands] = await Promise.all([
    countActiveRestaurants(ownerTenantId),
    countActiveBrands(ownerTenantId),
  ]);

  if (restaurantLimit !== null && activeRestaurants > restaurantLimit) {
    return {
      ok: false as const,
      status: 409,
      error:
        requestedPlan === 'pro'
          ? `No se puede cambiar a Pro: este tenant tiene ${activeRestaurants} restaurantes activos y Pro permite hasta 3. Cerrá restaurantes hasta quedar en 3 activos.`
          : `No se puede cambiar a Esencial: este tenant tiene ${activeRestaurants} restaurantes activos y Esencial permite solo 1.`,
    };
  }

  if (brandLimit !== null && activeBrands > brandLimit) {
    return {
      ok: false as const,
      status: 409,
      error:
        requestedPlan === 'pro'
          ? `No se puede cambiar a Pro: este tenant tiene ${activeBrands} marcas activas y Pro permite hasta 3. Desactivá marcas hasta quedar en 3 activas.`
          : `No se puede cambiar a Esencial: este tenant tiene ${activeBrands} marcas activas y Esencial permite solo 1.`,
    };
  }

  return {
    ok: true as const,
    activeRestaurants,
    activeBrands,
    restaurantLimit,
    brandLimit,
  };
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

  const requestedPlanRaw = normalizeNonEmptyString(body?.plan);
  const requestedPlan = normalizePlan(requestedPlanRaw);

  if (!requestedPlanRaw || !isPlanCode(requestedPlan)) {
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

  if (!access.restaurant?.id) {
    return NextResponse.json(
      { error: 'No se encontró un tenant válido para actualizar el plan.' },
      { status: 404 }
    );
  }

  try {
    const ownerTenantId = await resolveOwnerTenantId(access);

    const validation = await validateTenantPlanChange({
      ownerTenantId,
      requestedPlan,
    });

    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('restaurants')
      .update({ plan: requestedPlan })
      .or(`owner_tenant_id.eq.${ownerTenantId},id.eq.${access.restaurant.id}`)
      .select('id, slug, plan, owner_tenant_id, estado');

    if (error) {
      console.error('PUT /api/admin/plan update error:', error);
      return NextResponse.json(
        { error: 'No se pudo actualizar el plan del tenant.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tenantId: ownerTenantId,
      plan: requestedPlan,
      updated_restaurants: data?.length ?? 0,
      limits: {
        active_restaurants: validation.activeRestaurants,
        active_brands: validation.activeBrands,
        restaurant_limit: validation.restaurantLimit,
        brand_limit: validation.brandLimit,
      },
      restaurant: {
        ...access.restaurant,
        plan: requestedPlan,
      },
    });
  } catch (error) {
    console.error('PUT /api/admin/plan validation/update error:', error);

    return NextResponse.json(
      { error: 'No se pudo actualizar el plan del tenant.' },
      { status: 500 }
    );
  }
}