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

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('productos')
      .select(PRODUCTO_SELECT)
      .order('categoria', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    return NextResponse.json(
      { error: 'No se pudieron cargar los productos.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
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
      .insert([payload])
      .select(PRODUCTO_SELECT)
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creando producto:', error);
    return NextResponse.json(
      { error: 'No se pudo crear el producto.' },
      { status: 500 }
    );
  }
}