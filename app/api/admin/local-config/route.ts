import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  getFallbackAdminAccess,
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
} from '@/lib/adminAccess';
import { normalizeBusinessMode, type BusinessMode } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LocalConfigRow = {
  id?: number;
  restaurant_id?: string | number | null;
  nombre_local?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  celular?: string | null;
  email?: string | null;
  horario_atencion?: string | null;
  google_analytics_id?: string | null;
  google_analytics_property_id?: string | null;
  business_mode?: BusinessMode | string | null;
};

function getBusinessModeMeta(businessMode: BusinessMode) {
  if (businessMode === 'takeaway') {
    return {
      business_mode_label: 'Take Away',
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
    business_mode_label: 'Restaurante',
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

async function resolveAccessForRequest(request: NextRequest, session: unknown) {
  const requestedContext = extractRequestedTenantContext(request, session);

  try {
    return await resolveAdminAccess(requestedContext);
  } catch (error) {
    console.error('Local config access resolution error:', error);
    return getFallbackAdminAccess();
  }
}

function normalizeRow(row?: LocalConfigRow | null) {
  const businessMode = normalizeBusinessMode(row?.business_mode);

  return {
    id: row?.id ?? null,
    restaurant_id: row?.restaurant_id ?? null,
    nombre_local: row?.nombre_local ?? '',
    direccion: row?.direccion ?? '',
    telefono: row?.telefono ?? '',
    celular: row?.celular ?? '',
    email: row?.email ?? '',
    horario_atencion: row?.horario_atencion ?? '',
    google_analytics_id: row?.google_analytics_id ?? '',
    google_analytics_property_id: row?.google_analytics_property_id ?? '',
    business_mode: businessMode,
    public_ordering: getBusinessModeMeta(businessMode),
  };
}

async function readLocalConfigByRestaurantId(restaurantId: string | null) {
  if (!restaurantId) {
    const { data, error } = await supabaseAdmin
      .from('configuracion_local')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return (data as LocalConfigRow | null) ?? null;
  }

  const { data, error } = await supabaseAdmin
    .from('configuracion_local')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return (data as LocalConfigRow | null) ?? null;
}

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const access = await resolveAccessForRequest(request, auth.session);
    const restaurantId = access.restaurant?.id ?? null;

    const data = await readLocalConfigByRestaurantId(restaurantId);

    return NextResponse.json(normalizeRow(data), {
      status: 200,
    });
  } catch (error) {
    console.error('GET /api/admin/local-config', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Ocurrió un error inesperado al leer la configuración del local.';

    return NextResponse.json(
      {
        error: `No se pudo leer la configuración del local: ${message}`,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const access = await resolveAccessForRequest(request, auth.session);
    const restaurantId = access.restaurant?.id ?? null;
    const body = await request.json();

    const payload = {
      restaurant_id: restaurantId,
      nombre_local: String(body?.nombre_local ?? '').trim() || null,
      direccion: String(body?.direccion ?? '').trim() || null,
      telefono: String(body?.telefono ?? '').trim() || null,
      celular: String(body?.celular ?? '').trim() || null,
      email: String(body?.email ?? '').trim() || null,
      horario_atencion: String(body?.horario_atencion ?? '').trim() || null,
      google_analytics_id:
        String(body?.google_analytics_id ?? '').trim() || null,
      google_analytics_property_id:
        String(body?.google_analytics_property_id ?? '').trim() || null,
      business_mode: normalizeBusinessMode(body?.business_mode),
    };

    const current = await readLocalConfigByRestaurantId(restaurantId);

    if (current?.id) {
      const { data, error } = await supabaseAdmin
        .from('configuracion_local')
        .update(payload)
        .eq('id', current.id)
        .select('*')
        .single();

      if (error) {
        return NextResponse.json(
          {
            error: `No se pudo actualizar la configuración del local: ${error.message}`,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          config: normalizeRow(data as LocalConfigRow),
        },
        { status: 200 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('configuracion_local')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: `No se pudo crear la configuración del local: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        config: normalizeRow(data as LocalConfigRow),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('PUT /api/admin/local-config', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Ocurrió un error inesperado al guardar la configuración del local.';

    return NextResponse.json(
      {
        error: `No se pudo guardar la configuración del local: ${message}`,
      },
      { status: 500 }
    );
  }
}