import { NextRequest, NextResponse } from 'next/server';
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
  imagen_url
`;

function isTruthy(value: string | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'si';
}

export async function GET(request: NextRequest) {
  try {
    const soloDisponibles = isTruthy(
      request.nextUrl.searchParams.get('soloDisponibles')
    );

    let query = supabaseAdmin
      .from('productos')
      .select(PRODUCTO_SELECT)
      .order('categoria', { ascending: true })
      .order('nombre', { ascending: true });

    if (soloDisponibles) {
      query = query.eq('disponible', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('GET /api/productos - Supabase error:', error);
      return NextResponse.json(
        { error: error.message || 'No se pudieron cargar los productos.' },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('GET /api/productos - unexpected error:', error);
    return NextResponse.json(
      { error: 'No se pudieron cargar los productos.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const nombre = String(body?.nombre ?? '').trim();
    const descripcion = String(body?.descripcion ?? '').trim() || null;
    const precio = Number(body?.precio);
    const categoria = String(body?.categoria ?? '').trim() || null;
    const disponible =
      typeof body?.disponible === 'boolean' ? body.disponible : true;
    const imagen_url = String(body?.imagen_url ?? '').trim() || null;

    if (!nombre) {
      return NextResponse.json(
        { error: 'El nombre es obligatorio.' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(precio) || precio < 0) {
      return NextResponse.json(
        { error: 'El precio es inválido.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('productos')
      .insert([
        {
          nombre,
          descripcion,
          precio,
          categoria,
          disponible,
          imagen_url,
        },
      ])
      .select(PRODUCTO_SELECT)
      .single();

    if (error) {
      console.error('POST /api/productos - Supabase error:', error);
      return NextResponse.json(
        { error: error.message || 'No se pudo crear el producto.' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('POST /api/productos - unexpected error:', error);
    return NextResponse.json(
      { error: 'No se pudo crear el producto.' },
      { status: 500 }
    );
  }
}