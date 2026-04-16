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

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return false;
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const disponible = normalizeBoolean(body?.disponible);

    const { data, error } = await supabaseAdmin
      .from('productos')
      .update({ disponible })
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
    console.error('Error actualizando disponibilidad:', error);
    return NextResponse.json(
      { error: 'No se pudo actualizar la disponibilidad.' },
      { status: 500 }
    );
  }
}