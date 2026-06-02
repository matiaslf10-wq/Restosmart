import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  getFallbackAdminAccess,
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
} from '@/lib/adminAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AddonUpdateBody = {
  addon_key?: string;
  enabled?: boolean;
};

type AddonKey = 'multi_brand' | 'whatsapp_delivery' | 'billing';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeNonEmptyString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return fallback;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeNonEmptyString(value);
    if (normalized) return normalized;
  }

  return null;
}

function isAddonKey(value: unknown): value is AddonKey {
  return (
    value === 'multi_brand' ||
    value === 'whatsapp_delivery' ||
    value === 'billing'
  );
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

async function resolveAccessForRequest(request: NextRequest, session: unknown) {
  const requestedContext = extractRequestedTenantContext(request, session);

  try {
    return await resolveAdminAccess(requestedContext);
  } catch (error) {
    console.error('GET/PUT /api/admin/addons access resolution error:', error);
    return getFallbackAdminAccess();
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(request, auth.session);

  const multiBrandAvailable = access.plan !== 'esencial';

  return NextResponse.json({
    ok: true,
    tenantId: access.tenantId,
    addons: {
      whatsapp_delivery: !!access.addons.whatsapp_delivery,
      multi_brand: !!access.addons.multi_brand,
      billing: false,
    },
    items: [
      {
        key: 'whatsapp_delivery',
        label: 'WhatsApp Delivery',
        description:
          'Permite recibir pedidos por WhatsApp y gestionarlos desde RestoSmart.',
        enabled: !!access.addons.whatsapp_delivery,
        configurable: false,
        available: true,
        status: access.addons.whatsapp_delivery ? 'Activo' : 'Inactivo',
      },
      {
        key: 'multi_brand',
        label: 'Multimarca',
        description:
          'Permite administrar varias marcas internas dentro del mismo local y tenant.',
        enabled: !!access.addons.multi_brand,
        configurable: false,
        available: multiBrandAvailable,
        status:
          access.plan === 'esencial'
            ? 'Disponible desde Pro'
            : access.addons.multi_brand
            ? 'Activo'
            : 'Inactivo',
      },
      {
        key: 'billing',
        label: 'Facturación ARCA',
        description:
          'Integración futura para asistir la emisión y gestión de comprobantes legales.',
        enabled: false,
        configurable: false,
        available: false,
        status: 'Próximamente',
      },
    ],
  });
}

export async function PUT(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(request, auth.session);

  let body: AddonUpdateBody | null = null;

  try {
    body = (await request.json()) as AddonUpdateBody;
  } catch {
    body = null;
  }

  const addonKeyRaw = normalizeNonEmptyString(body?.addon_key);

  if (!isAddonKey(addonKeyRaw)) {
    return NextResponse.json({ error: 'Add-on inválido.' }, { status: 400 });
  }

  if (addonKeyRaw === 'billing') {
    return NextResponse.json(
      { error: 'Facturación todavía no está disponible.' },
      { status: 409 }
    );
  }

  const requestedEnabled = normalizeBoolean(body?.enabled, false);

  const currentEnabled =
    addonKeyRaw === 'multi_brand'
      ? !!access.addons.multi_brand
      : !!access.addons.whatsapp_delivery;

  if (requestedEnabled === currentEnabled) {
    return NextResponse.json({
      ok: true,
      mode: 'no_change',
      tenantId: access.tenantId,
      addon_key: addonKeyRaw,
      enabled: currentEnabled,
      message: 'El add-on ya está en ese estado.',
    });
  }

  if (
    addonKeyRaw === 'multi_brand' &&
    requestedEnabled &&
    access.plan === 'esencial'
  ) {
    return NextResponse.json(
      {
        ok: false,
        checkout_required: true,
        error:
          'Multimarca está disponible desde el plan Pro y requiere activación comercial.',
        addon_key: addonKeyRaw,
        tenantId: access.tenantId,
      },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      checkout_required: true,
      error:
        'La activación, modificación o baja de add-ons pagos requiere activación comercial y cobro. No se puede modificar directamente desde esta API.',
      addon_key: addonKeyRaw,
      current_enabled: currentEnabled,
      requested_enabled: requestedEnabled,
      tenantId: access.tenantId,
    },
    { status: 402 }
  );
}