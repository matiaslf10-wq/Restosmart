import { ownsProductInRestaurant } from '@/lib/adminProductAccess';
import type { AdminSession } from '@/lib/adminAuth';
import { resolveAuthorizedAdminAccess } from '@/lib/authorizedAdminAccess';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  type AdminAccessResolutionOptions,
  type AdminAccessSnapshot,
} from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRODUCTO_SELECT = `
  id,
  nombre,
  descripcion,
  precio,
  categoria,
  disponible,
  imagen_url,
  control_stock,
  stock_actual,
  permitir_sin_stock,
  marca_id
`;

type Params = {
  params: Promise<{ id: string }>;
};

type ProductoOwnershipRow = {
  id: number;
  marca_id: string | null;
};

type RestaurantRow = {
  id: number | string;
  slug: string | null;
  estado: string | null;
  owner_tenant_id: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeNonEmptyString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return false;
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
    request.nextUrl.searchParams.get('restaurant'),
    request.nextUrl.searchParams.get('restaurantSlug'),
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
    return await resolveAuthorizedAdminAccess(session as AdminSession, requestedContext);
  } catch (error) {
    console.error('Producto disponible access resolution error:', error);
    return null;
  }
}

async function validateProductBelongsToAccess(productoId: number, access: AdminAccessSnapshot) {
  if (!await ownsProductInRestaurant(productoId, access)) {
    return NextResponse.json({ error: 'Producto no encontrado para esta sucursal.' }, { status: 404 });
  }
  return null;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(req, auth.session);

  if (!access) {
  return NextResponse.json(
    {
      error:
        'No se pudo identificar el tenant para actualizar la disponibilidad.',
    },
    { status: 400 }
  );
}

  try {
    const { id } = await params;
    const productoId = Number(id);

    if (!Number.isFinite(productoId) || productoId <= 0) {
      return NextResponse.json(
        { error: 'ID de producto inválido.' },
        { status: 400 }
      );
    }

    const accessError = await validateProductBelongsToAccess(productoId, access);
    if (accessError) return accessError;

    const body = await req.json();
    const disponible = normalizeBoolean(body?.disponible);

    const { data, error } = await supabaseAdmin
      .from('productos')
      .update({ disponible })
      .eq('id', productoId)
      .select(PRODUCTO_SELECT)
      .maybeSingle();

    if (error) {
      console.error(
        'PUT /api/productos/[id]/disponible - Supabase error:',
        error
      );

      return NextResponse.json(
        { error: error.message || 'No se pudo actualizar la disponibilidad.' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Producto no encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error actualizando disponibilidad:', error);

    return NextResponse.json(
      { error: 'No se pudo actualizar la disponibilidad.' },
      { status: 500 }
    );
  }
}