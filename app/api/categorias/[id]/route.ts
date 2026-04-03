import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

type Params = {
  params: Promise<{ id: string }>;
};

const FALLBACK_CATEGORY_NAME = 'Otros';

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const nombre = String(body?.nombre ?? '').trim();

    if (!nombre) {
      return NextResponse.json(
        { error: 'El nombre es obligatorio.' },
        { status: 400 }
      );
    }

    const { data: actual, error: errorActual } = await supabase
  .from('categorias')
  .select('id, nombre, orden')
  .eq('id', id)
  .single();

if (errorActual || !actual) {
  return NextResponse.json(
    { error: 'Categoría no encontrada.' },
    { status: 404 }
  );
}

if (actual.nombre === FALLBACK_CATEGORY_NAME) {
  return NextResponse.json(
    { error: `No se puede renombrar la categoría "${FALLBACK_CATEGORY_NAME}".` },
    { status: 400 }
  );
}

    const nombreAnterior = actual.nombre;

    const { data, error } = await supabase
      .from('categorias')
      .update({ nombre })
      .eq('id', id)
      .select('id, nombre, orden')
      .single();

    if (error) {
      if ((error as any)?.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe una categoría con ese nombre.' },
          { status: 409 }
        );
      }
      throw error;
    }

    if (nombreAnterior !== nombre) {
      const { error: errorProductos } = await supabase
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

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const { data: categoria, error: errorCategoria } = await supabase
      .from('categorias')
      .select('id, nombre')
      .eq('id', id)
      .single();

    if (errorCategoria || !categoria) {
      return NextResponse.json(
        { error: 'Categoría no encontrada.' },
        { status: 404 }
      );
    }

    if (categoria.nombre === FALLBACK_CATEGORY_NAME) {
      return NextResponse.json(
        { error: `No se puede eliminar la categoría "${FALLBACK_CATEGORY_NAME}".` },
        { status: 400 }
      );
    }

    const { data: fallback, error: errorFallback } = await supabase
      .from('categorias')
      .select('id, nombre')
      .eq('nombre', FALLBACK_CATEGORY_NAME)
      .single();

    if (errorFallback || !fallback) {
      return NextResponse.json(
        { error: `No existe la categoría de respaldo "${FALLBACK_CATEGORY_NAME}".` },
        { status: 500 }
      );
    }

    const { error: errorProductos } = await supabase
      .from('productos')
      .update({ categoria: FALLBACK_CATEGORY_NAME })
      .eq('categoria', categoria.nombre);

    if (errorProductos) throw errorProductos;

    const { error: errorMenuItems } = await supabase
      .from('menu_items')
      .update({ categoria_id: fallback.id })
      .eq('categoria_id', categoria.id);

    if (errorMenuItems) throw errorMenuItems;

    const { error: errorDelete } = await supabase
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