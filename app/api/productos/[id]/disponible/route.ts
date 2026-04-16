import { NextResponse } from 'next/server';
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
    const productoId = Number(id);

    if (!Number.isFinite(productoId) || productoId <= 0) {
      return NextResponse.json(
        { error: 'ID de producto inválido.' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const disponible = normalizeBoolean(body?.disponible);

    const { data, error } = await supabaseAdmin
      .from('productos')
      .update({ disponible })
      .eq('id', productoId)
      .select(PRODUCTO_SELECT)
      .maybeSingle();

    if (error) {
      console.error('PUT /api/productos/[id]/disponible - Supabase error:', error);
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