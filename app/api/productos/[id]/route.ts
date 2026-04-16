import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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
  permitir_sin_stock
`;

type Params = {
  params: Promise<{ id: string }>;
};

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return fallback;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const control_stock = normalizeBoolean(body?.control_stock, false);
    const stock_actual = control_stock
      ? Math.max(0, Math.trunc(normalizeNumber(body?.stock_actual, 0)))
      : 0;
    const permitir_sin_stock = control_stock
      ? normalizeBoolean(body?.permitir_sin_stock, false)
      : true;

    const payload = {
      nombre: String(body?.nombre ?? '').trim(),
      descripcion: body?.descripcion ? String(body.descripcion).trim() : null,
      precio: normalizeNumber(body?.precio, 0),
      categoria: body?.categoria ? String(body.categoria).trim() : null,
      disponible: normalizeBoolean(body?.disponible, true),
      imagen_url: body?.imagen_url ? String(body.imagen_url).trim() : null,
      control_stock,
      stock_actual,
      permitir_sin_stock,
    };

    if (!payload.nombre) {
      return NextResponse.json(
        { error: 'El nombre es obligatorio.' },
        { status: 400 }
      );
    }

    if (!payload.categoria) {
      return NextResponse.json(
        { error: 'La categoría es obligatoria.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('productos')
      .update(payload)
      .eq('id', id)
      .select(PRODUCTO_SELECT)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Producto no encontrado.' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error actualizando producto:', error);
    return NextResponse.json(
      { error: 'No se pudo actualizar el producto.' },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('productos')
      .delete()
      .eq('id', id)
      .select('id')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Producto no encontrado.' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (error) {
    console.error('Error eliminando producto:', error);
    return NextResponse.json(
      { error: 'No se pudo eliminar el producto.' },
      { status: 500 }
    );
  }
}