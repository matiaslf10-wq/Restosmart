import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
  type AdminAccessSnapshot,
} from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizeBusinessMode, type BusinessMode } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DELIVERY_MESA_ID = 0;

type MesaRow = {
  id: number;
  nombre: string | null;
  numero: number | null;
  restaurant_id: number | string | null;
};

type LocalConfigRow = {
  nombre_local: string | null;
  business_mode: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeNonEmptyString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function pickFirstString(...values: unknown[]) {
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

async function resolveAccessForRequest(
  request: NextRequest,
  session: unknown
): Promise<AdminAccessSnapshot | null> {
  const requestedContext = extractRequestedTenantContext(request, session);

  try {
    return await resolveAdminAccess(requestedContext);
  } catch (error) {
    console.error('Mesas access resolution error:', error);
    return null;
  }
}

function getMesaNumero(mesa: MesaRow, fallbackIndex = 1) {
  if (typeof mesa.numero === 'number' && mesa.numero > 0) {
    return mesa.numero;
  }

  return fallbackIndex;
}

function sortMesas(rows: MesaRow[]) {
  return [...rows].sort((a, b) => {
    const numeroA = getMesaNumero(a, Number.MAX_SAFE_INTEGER);
    const numeroB = getMesaNumero(b, Number.MAX_SAFE_INTEGER);

    if (numeroA !== numeroB) return numeroA - numeroB;
    return Number(a.id) - Number(b.id);
  });
}

function getNextAvailableMesaNumero(rows: MesaRow[]) {
  const used = new Set(
    rows
      .map((mesa) => mesa.numero)
      .filter((numero): numero is number => typeof numero === 'number' && numero > 0)
  );

  let next = 1;

  while (used.has(next)) {
    next += 1;
  }

  return next;
}

function getAccessRestaurantId(access: AdminAccessSnapshot | null) {
  const restaurantId = access?.restaurant?.id;

  if (restaurantId === null || restaurantId === undefined) return null;

  return String(restaurantId);
}

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(request, auth.session);
  const restaurantId = getAccessRestaurantId(access);

  if (!access || !restaurantId) {
    return NextResponse.json(
      { error: 'Falta identificar una sucursal válida para cargar mesas.' },
      { status: 400 }
    );
  }

  try {
    const configPromise = supabaseAdmin
      .from('configuracion_local')
      .select('nombre_local, business_mode')
      .eq('restaurant_id', restaurantId)
      .limit(1)
      .maybeSingle();

    const mesasPromise = supabaseAdmin
      .from('mesas')
      .select('id, nombre, numero, restaurant_id')
      .eq('restaurant_id', restaurantId)
      .gt('id', DELIVERY_MESA_ID);

    const [configRes, mesasRes] = await Promise.all([
      configPromise,
      mesasPromise,
    ]);

    if (configRes.error) {
      throw configRes.error;
    }

    if (mesasRes.error) {
      throw mesasRes.error;
    }

    const config = (configRes.data ?? null) as LocalConfigRow | null;
    const businessMode = normalizeBusinessMode(config?.business_mode);

    return NextResponse.json({
      ok: true,
      restaurant: {
        id: restaurantId,
        label:
          config?.nombre_local?.trim() ||
          access.restaurant?.slug ||
          `Sucursal ${restaurantId}`,
        business_mode: businessMode,
      },
      mesas: sortMesas((mesasRes.data ?? []) as MesaRow[]),
    });
  } catch (error) {
    console.error('GET /api/admin/mesas', error);

    return NextResponse.json(
      { error: 'No se pudieron cargar las mesas de esta sucursal.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(request, auth.session);
  const restaurantId = getAccessRestaurantId(access);

  if (!access || !restaurantId) {
    return NextResponse.json(
      { error: 'Falta identificar una sucursal válida para crear mesas.' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const nombreLimpio = String(body?.nombre ?? '').trim();

    const { data: configData, error: configError } = await supabaseAdmin
      .from('configuracion_local')
      .select('nombre_local, business_mode')
      .eq('restaurant_id', restaurantId)
      .limit(1)
      .maybeSingle();

    if (configError) {
      throw configError;
    }

    const config = (configData ?? null) as LocalConfigRow | null;
    const businessMode = normalizeBusinessMode(config?.business_mode);

    if (businessMode !== 'restaurant') {
      return NextResponse.json(
        { error: 'Esta sucursal no está configurada en modo restaurante.' },
        { status: 409 }
      );
    }

    const { data: mesasData, error: mesasError } = await supabaseAdmin
      .from('mesas')
      .select('id, nombre, numero, restaurant_id')
      .eq('restaurant_id', restaurantId)
      .gt('id', DELIVERY_MESA_ID);

    if (mesasError) {
      throw mesasError;
    }

    const mesas = (mesasData ?? []) as MesaRow[];
    const numeroNuevo = getNextAvailableMesaNumero(mesas);
    const nombreFinal = nombreLimpio || `Mesa ${numeroNuevo}`;

    const { data, error } = await supabaseAdmin
      .from('mesas')
      .insert({
        nombre: nombreFinal,
        numero: numeroNuevo,
        restaurant_id: restaurantId,
      })
      .select('id, nombre, numero, restaurant_id')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        mesa: data as MesaRow,
        restaurant: {
          id: restaurantId,
          label:
            config?.nombre_local?.trim() ||
            access.restaurant?.slug ||
            `Sucursal ${restaurantId}`,
          business_mode: businessMode as BusinessMode,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/admin/mesas', error);

    return NextResponse.json(
      { error: 'No se pudo crear la mesa.' },
      { status: 500 }
    );
  }
}