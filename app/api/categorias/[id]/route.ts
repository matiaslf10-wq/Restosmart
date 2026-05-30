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

type Params = {
  params: Promise<{ id: string }>;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type CategoriaRow = {
  id: number;
  nombre: string;
  orden: number | null;
  tenant_id: string | null;
};

type RestaurantRow = {
  id: number | string;
};

type ProductRestaurantRow = {
  producto_id: number | string | null;
};

const FALLBACK_CATEGORY_NAME = 'Otros';

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

function normalizeCategoryId(value: string) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
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
    console.error('Categoria por ID access resolution error:', error);
    return null;
  }
}

async function getActiveRestaurantIdsForTenant(access: AdminAccessSnapshot) {
  const { data, error } = await supabaseAdmin
    .from('restaurants')
    .select('id')
    .eq('owner_tenant_id', access.tenantId)
    .neq('estado', 'cerrado');

  if (error) {
    console.error('Error leyendo sucursales del tenant:', error);
    throw new Error('No se pudieron leer las sucursales del tenant.');
  }

  return ((data ?? []) as RestaurantRow[]).map((row) => String(row.id));
}

async function getProductIdsForTenant(access: AdminAccessSnapshot) {
  const restaurantIds = await getActiveRestaurantIdsForTenant(access);

  if (restaurantIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('producto_restaurantes')
    .select('producto_id')
    .in('restaurant_id', restaurantIds);

  if (error) {
    console.error('Error leyendo productos del tenant:', error);
    throw new Error('No se pudieron leer los productos del tenant.');
  }

  return Array.from(
    new Set(
      ((data ?? []) as ProductRestaurantRow[])
        .map((row) => row.producto_id)
        .filter((id): id is number | string => id !== null && id !== undefined)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
}

async function ensureFallbackCategory(access: AdminAccessSnapshot) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('categorias')
    .select('id, nombre, orden, tenant_id')
    .eq('tenant_id', access.tenantId)
    .eq('nombre', FALLBACK_CATEGORY_NAME)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) return existing as CategoriaRow;

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
        nombre: FALLBACK_CATEGORY_NAME,
        orden,
      },
    ])
    .select('id, nombre, orden, tenant_id')
    .single();

  if (error) throw error;

  return data as CategoriaRow;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(req, auth.session);

  if (!access?.tenantId) {
    return NextResponse.json(
      { error: 'No se pudo identificar el tenant para actualizar la categoría.' },
      { status: 400 }
    );
  }

  try {
    const { id } = await params;
    const categoriaId = normalizeCategoryId(id);

    if (!categoriaId) {
      return NextResponse.json(
        { error: 'ID de categoría inválido.' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const nombre = String(body?.nombre ?? '').trim();

    if (!nombre) {
      return NextResponse.json(
        { error: 'El nombre es obligatorio.' },
        { status: 400 }
      );
    }

    const { data: actual, error: errorActual } = await supabaseAdmin
      .from('categorias')
      .select('id, nombre, orden, tenant_id')
      .eq('id', categoriaId)
      .eq('tenant_id', access.tenantId)
      .maybeSingle();

    if (errorActual) throw errorActual;

    if (!actual) {
      return NextResponse.json(
        { error: 'Categoría no encontrada para este tenant.' },
        { status: 404 }
      );
    }

    const actualRow = actual as CategoriaRow;

    if (actualRow.nombre === FALLBACK_CATEGORY_NAME) {
      return NextResponse.json(
        {
          error: `No se puede renombrar la categoría "${FALLBACK_CATEGORY_NAME}".`,
        },
        { status: 400 }
      );
    }

    const nombreAnterior = actualRow.nombre;

    const { data, error } = await supabaseAdmin
      .from('categorias')
      .update({ nombre })
      .eq('id', categoriaId)
      .eq('tenant_id', access.tenantId)
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

    if (nombreAnterior !== nombre) {
      const productIds = await getProductIdsForTenant(access);

      if (productIds.length > 0) {
        const { error: errorProductos } = await supabaseAdmin
          .from('productos')
          .update({ categoria: nombre })
          .in('id', productIds)
          .eq('categoria', nombreAnterior);

        if (errorProductos) throw errorProductos;
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error actualizando categoría:', error);

    return NextResponse.json(
      { error: 'No se pudo actualizar la categoría.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
  }

  const access = await resolveAccessForRequest(req, auth.session);

  if (!access?.tenantId) {
    return NextResponse.json(
      { error: 'No se pudo identificar el tenant para eliminar la categoría.' },
      { status: 400 }
    );
  }

  try {
    const { id } = await params;
    const categoriaId = normalizeCategoryId(id);

    if (!categoriaId) {
      return NextResponse.json(
        { error: 'ID de categoría inválido.' },
        { status: 400 }
      );
    }

    const { data: categoria, error: errorCategoria } = await supabaseAdmin
      .from('categorias')
      .select('id, nombre, orden, tenant_id')
      .eq('id', categoriaId)
      .eq('tenant_id', access.tenantId)
      .maybeSingle();

    if (errorCategoria) throw errorCategoria;

    if (!categoria) {
      return NextResponse.json(
        { error: 'Categoría no encontrada para este tenant.' },
        { status: 404 }
      );
    }

    const categoriaRow = categoria as CategoriaRow;

    if (categoriaRow.nombre === FALLBACK_CATEGORY_NAME) {
      return NextResponse.json(
        {
          error: `No se puede eliminar la categoría "${FALLBACK_CATEGORY_NAME}".`,
        },
        { status: 400 }
      );
    }

    const fallback = await ensureFallbackCategory(access);
    const productIds = await getProductIdsForTenant(access);

    if (productIds.length > 0) {
      const { error: errorProductos } = await supabaseAdmin
        .from('productos')
        .update({ categoria: FALLBACK_CATEGORY_NAME })
        .in('id', productIds)
        .eq('categoria', categoriaRow.nombre);

      if (errorProductos) throw errorProductos;
    }

    const { error: errorDelete } = await supabaseAdmin
      .from('categorias')
      .delete()
      .eq('id', categoriaRow.id)
      .eq('tenant_id', access.tenantId);

    if (errorDelete) throw errorDelete;

    return NextResponse.json({
      ok: true,
      deletedId: categoriaRow.id,
      movedTo: fallback.nombre,
    });
  } catch (error) {
    console.error('Error eliminando categoría:', error);

    return NextResponse.json(
      { error: 'No se pudo eliminar la categoría.' },
      { status: 500 }
    );
  }
}