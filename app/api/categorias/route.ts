import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
  type AdminAccessSnapshot,
} from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type CategoriaRow = {
  id: number;
  nombre: string;
  orden: number | null;
  tenant_id?: string | null;
};

function isSupabaseErrorLike(error: unknown): error is SupabaseErrorLike {
  return !!error && typeof error === 'object';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeNonEmptyString(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeNonEmptyString(value);
    if (text) return text;
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
    console.error('Categorias access resolution error:', error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(req, auth.session);

  if (!access?.tenantId) {
    return NextResponse.json(
      { error: 'No se pudo identificar el tenant para cargar categorías.' },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('categorias')
      .select('id, nombre, orden, tenant_id')
      .eq('tenant_id', access.tenantId)
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) throw error;

    return NextResponse.json((data ?? []) as CategoriaRow[]);
  } catch (error) {
    console.error('Error obteniendo categorías:', error);

    return NextResponse.json(
      { error: 'No se pudieron cargar las categorías.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(req, auth.session);

  if (!access?.tenantId) {
    return NextResponse.json(
      { error: 'No se pudo identificar el tenant para crear la categoría.' },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const nombre = String(body?.nombre ?? '').trim();

    if (!nombre) {
      return NextResponse.json(
        { error: 'El nombre es obligatorio.' },
        { status: 400 }
      );
    }

    const { data: ultima, error: ultimaError } = await supabaseAdmin
      .from('categorias')
      .select('orden')
      .eq('tenant_id', access.tenantId)
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimaError) throw ultimaError;

    const orden = Number(ultima?.orden ?? 0) + 1;

    const { data, error } = await supabaseAdmin
      .from('categorias')
      .insert([
        {
          tenant_id: access.tenantId,
          nombre,
          orden,
        },
      ])
      .select('id, nombre, orden, tenant_id')
      .single();

    if (error) {
      if (isSupabaseErrorLike(error) && error.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe una categoría con ese nombre.' },
          { status: 409 }
        );
      }

      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creando categoría:', error);

    const message =
      error instanceof Error ? error.message : 'No se pudo crear la categoría.';

    return NextResponse.json(
      { error: message || 'No se pudo crear la categoría.' },
      { status: 500 }
    );
  }
}