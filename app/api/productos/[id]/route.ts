import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
};

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

    const nombre = String(body?.nombre ?? '').trim();
    const descripcion =
      String(body?.descripcion ?? '').trim() || null;
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
      .update({
        nombre,
        descripcion,
        precio,
        categoria,
        disponible,
        imagen_url,
      })
      .eq('id', productoId)
      .select('id, nombre, descripcion, precio, categoria, disponible, imagen_url')
      .maybeSingle();

    if (error) {
      console.error(`PUT /api/productos/${productoId} - Supabase error:`, error);
      return NextResponse.json(
        { error: error.message || 'No se pudo actualizar el producto.' },
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
    console.error('PUT /api/productos/[id] - unexpected error:', error);
    return NextResponse.json(
      { error: 'No se pudo actualizar el producto.' },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const productoId = Number(id);

    if (!Number.isFinite(productoId) || productoId <= 0) {
      return NextResponse.json(
        { error: 'ID de producto inválido.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('productos')
      .delete()
      .eq('id', productoId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error(`DELETE /api/productos/${productoId} - Supabase error:`, error);
      return NextResponse.json(
        { error: error.message || 'No se pudo eliminar el producto.' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Producto no encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (error) {
    console.error('DELETE /api/productos/[id] - unexpected error:', error);
    return NextResponse.json(
      { error: 'No se pudo eliminar el producto.' },
      { status: 500 }
    );
  }
}