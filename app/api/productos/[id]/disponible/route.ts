import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

type Params = {
  params: Promise<{ id: string }>;
};

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const { disponible } = body;

    const { data, error } = await supabase
      .from('productos')
      .update({ disponible })
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
    console.error('Error actualizando disponibilidad:', error);
    return NextResponse.json(
      { error: 'No se pudo actualizar la disponibilidad.' },
      { status: 500 }
    );
  }
}