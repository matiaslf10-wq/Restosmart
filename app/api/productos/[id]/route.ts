import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

type Params = {
  params: Promise<{ id: string }>;
};

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const { nombre, descripcion, precio, categoria, disponible, imagen_url } = body;

    const { data, error } = await supabase
      .from('productos')
      .update({
        nombre,
        descripcion,
        precio,
        categoria,
        disponible,
        imagen_url,
      })
      .eq('id', id)
      .select('id, nombre, descripcion, precio, categoria, disponible, imagen_url')
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

    const { data, error } = await supabase
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