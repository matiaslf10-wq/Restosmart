import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('id, nombre, descripcion, precio, categoria, disponible, imagen_url')
      .order('categoria', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data);
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

    const { nombre, descripcion, precio, categoria, disponible, imagen_url } = body;

    const { data, error } = await supabase
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
      .select('id, nombre, descripcion, precio, categoria, disponible, imagen_url')
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