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

type ProductoPayload = {
  nombre?: unknown;
  descripcion?: unknown;
  precio?: unknown;
  categoria?: unknown;
  disponible?: unknown;
  imagen_url?: unknown;
  control_stock?: unknown;
  stock_actual?: unknown;
  permitir_sin_stock?: unknown;
};

function normalizeOptionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeRequiredText(value: unknown, fieldLabel: string) {
  const text = String(value ?? '').trim();

  if (!text) {
    throw new Error(`El campo "${fieldLabel}" es obligatorio.`);
  }

  return text;
}

function normalizePrice(value: unknown) {
  const parsed = Number(String(value ?? '').replace(',', '.'));

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('El precio debe ser un número válido mayor o igual a 0.');
  }

  return parsed;
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return fallback;
}

function normalizeStock(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('El stock actual debe ser un entero mayor o igual a 0.');
  }

  return parsed;
}

function buildProductoInsert(body: ProductoPayload) {
  const nombre = normalizeRequiredText(body.nombre, 'nombre');
  const descripcion = normalizeOptionalText(body.descripcion);
  const precio = normalizePrice(body.precio);
  const categoria = normalizeOptionalText(body.categoria);
  const disponible = normalizeBoolean(body.disponible, true);
  const imagen_url = normalizeOptionalText(body.imagen_url);

  const control_stock = normalizeBoolean(body.control_stock, false);
  const stock_actual = control_stock ? normalizeStock(body.stock_actual) : 0;
  const permitir_sin_stock = control_stock
    ? normalizeBoolean(body.permitir_sin_stock, false)
    : false;

  return {
    nombre,
    descripcion,
    precio,
    categoria,
    disponible,
    imagen_url,
    control_stock,
    stock_actual,
    permitir_sin_stock,
  };
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
    const body = (await req.json()) as ProductoPayload;
    const payload = buildProductoInsert(body);

    const { data, error } = await supabaseAdmin
      .from('productos')
      .insert([payload])
      .select(PRODUCTO_SELECT)
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creando producto:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'No se pudo crear el producto.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}