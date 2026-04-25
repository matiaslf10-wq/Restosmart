import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  getFallbackAdminAccess,
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
} from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AddonUpdateBody = {
  addon_key?: string;
  enabled?: boolean;
};

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

async function setTenantAddon(
  tenantId: string,
  addonKey: string,
  enabled: boolean
) {
  const { data: existing, error: readError } = await supabaseAdmin
    .from('tenant_addons')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('addon_key', addonKey)
    .maybeSingle();

  if (readError) throw readError;

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from('tenant_addons')
      .update({
        enabled,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from('tenant_addons').insert([
    {
      tenant_id: tenantId,
      addon_key: addonKey,
      enabled,
    },
  ]);

  if (error) throw error;
}

async function setWhatsAppDeliveryAddon(tenantId: string, enabled: boolean) {
  const { data: existing, error: readError } = await supabaseAdmin
    .from('whatsapp_connections')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (readError) throw readError;

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from('whatsapp_connections')
      .update({ add_on_enabled: enabled })
      .eq('id', existing.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from('whatsapp_connections').insert([
    {
      tenant_id: tenantId,
      add_on_enabled: enabled,
    },
  ]);

  if (error) throw error;
}

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(request, auth.session);

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
        configurable: true,
        available: true,
        status: access.addons.whatsapp_delivery ? 'Activo' : 'Inactivo',
      },
      {
        key: 'multi_brand',
        label: 'Multimarca',
        description:
          'Permite administrar varias marcas internas dentro del mismo local y tenant.',
        enabled: !!access.addons.multi_brand,
        configurable: true,
        available: true,
        status: access.addons.multi_brand ? 'Activo' : 'Inactivo',
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

  const addonKey = normalizeNonEmptyString(body?.addon_key);
  const enabled = normalizeBoolean(body?.enabled, false);

  if (!addonKey) {
    return NextResponse.json(
      { error: 'El add-on es obligatorio.' },
      { status: 400 }
    );
  }

  if (addonKey === 'billing') {
    return NextResponse.json(
      { error: 'Facturación todavía no está disponible.' },
      { status: 409 }
    );
  }

  if (addonKey !== 'multi_brand' && addonKey !== 'whatsapp_delivery') {
    return NextResponse.json({ error: 'Add-on inválido.' }, { status: 400 });
  }

  try {
    if (addonKey === 'multi_brand') {
      await setTenantAddon(access.tenantId, 'multi_brand', enabled);
    }

    if (addonKey === 'whatsapp_delivery') {
      await Promise.all([
        setTenantAddon(access.tenantId, 'whatsapp_delivery', enabled),
        setWhatsAppDeliveryAddon(access.tenantId, enabled),
      ]);
    }

    const updatedAccess = await resolveAdminAccess({
      tenantSlug: access.restaurant?.slug ?? access.tenantId,
      restaurantId: access.restaurant?.id ?? null,
    });

    return NextResponse.json({
      ok: true,
      tenantId: updatedAccess.tenantId,
      addons: {
        whatsapp_delivery: !!updatedAccess.addons.whatsapp_delivery,
        multi_brand: !!updatedAccess.addons.multi_brand,
        billing: false,
      },
    });
  } catch (error) {
    console.error('PUT /api/admin/addons error:', error);
    return NextResponse.json(
      { error: 'No se pudo actualizar el add-on.' },
      { status: 500 }
    );
  }
}