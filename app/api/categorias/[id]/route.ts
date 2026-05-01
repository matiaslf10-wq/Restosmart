import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
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

const FALLBACK_CATEGORY_NAME = 'Otros';

function isSupabaseErrorLike(error: unknown): error is SupabaseErrorLike {
  return !!error && typeof error === 'object';
}

function normalizeCategoryId(value: string) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
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
      .select('id, nombre, orden')
      .eq('id', categoriaId)
      .maybeSingle();

    if (errorActual) throw errorActual;

    if (!actual) {
      return NextResponse.json(
        { error: 'Categoría no encontrada.' },
        { status: 404 }
      );
    }

    if (actual.nombre === FALLBACK_CATEGORY_NAME) {
      return NextResponse.json(
        {
          error: `No se puede renombrar la categoría "${FALLBACK_CATEGORY_NAME}".`,
        },
        { status: 400 }
      );
    }

    const nombreAnterior = actual.nombre;

    const { data, error } = await supabaseAdmin
      .from('categorias')
      .update({ nombre })
      .eq('id', categoriaId)
      .select('id, nombre, orden')
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
      const { error: errorProductos } = await supabaseAdmin
        .from('productos')
        .update({ categoria: nombre })
        .eq('categoria', nombreAnterior);

      if (errorProductos) throw errorProductos;
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
      .select('id, nombre')
      .eq('id', categoriaId)
      .maybeSingle();

    if (errorCategoria) throw errorCategoria;

    if (!categoria) {
      return NextResponse.json(
        { error: 'Categoría no encontrada.' },
        { status: 404 }
      );
    }

    if (categoria.nombre === FALLBACK_CATEGORY_NAME) {
      return NextResponse.json(
        {
          error: `No se puede eliminar la categoría "${FALLBACK_CATEGORY_NAME}".`,
        },
        { status: 400 }
      );
    }

    const { data: fallback, error: errorFallback } = await supabaseAdmin
      .from('categorias')
      .select('id, nombre')
      .eq('nombre', FALLBACK_CATEGORY_NAME)
      .maybeSingle();

    if (errorFallback) throw errorFallback;

    if (!fallback) {
      return NextResponse.json(
        {
          error: `No existe la categoría de respaldo "${FALLBACK_CATEGORY_NAME}".`,
        },
        { status: 500 }
      );
    }

    const { error: errorProductos } = await supabaseAdmin
      .from('productos')
      .update({ categoria: FALLBACK_CATEGORY_NAME })
      .eq('categoria', categoria.nombre);

    if (errorProductos) throw errorProductos;

    const { error: errorDelete } = await supabaseAdmin
      .from('categorias')
      .delete()
      .eq('id', categoria.id);

    if (errorDelete) throw errorDelete;

    return NextResponse.json({
      ok: true,
      deletedId: categoria.id,
      movedTo: FALLBACK_CATEGORY_NAME,
    });
  } catch (error) {
    console.error('Error eliminando categoría:', error);

    return NextResponse.json(
      { error: 'No se pudo eliminar la categoría.' },
      { status: 500 }
    );
  }
}