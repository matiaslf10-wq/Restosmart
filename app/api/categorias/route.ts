import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('categorias')
      .select('id, nombre, orden')
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Error obteniendo categorías:', error);
    return NextResponse.json(
      { error: 'No se pudieron cargar las categorías.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const nombre = String(body?.nombre ?? '').trim();

    if (!nombre) {
      return NextResponse.json(
        { error: 'El nombre es obligatorio.' },
        { status: 400 }
      );
    }

    const { data: ultima } = await supabase
      .from('categorias')
      .select('orden')
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();

    const orden = (ultima?.orden ?? 0) + 1;

    const { data, error } = await supabase
      .from('categorias')
      .insert([{ nombre, orden }])
      .select('id, nombre, orden')
      .single();

    if (error) {
      if ((error as any)?.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe una categoría con ese nombre.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creando categoría:', error);
    return NextResponse.json(
      { error: 'No se pudo crear la categoría.' },
      { status: 500 }
    );
  }
}