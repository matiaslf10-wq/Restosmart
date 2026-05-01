import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

function isSupabaseErrorLike(error: unknown): error is SupabaseErrorLike {
  return !!error && typeof error === 'object';
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
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

export async function POST(req: NextRequest) {
  const auth = requireAdminAuth(req);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const nombre = String(body?.nombre ?? '').trim();

    if (!nombre) {
      return NextResponse.json(
        { error: 'El nombre es obligatorio.' },
        { status: 400 }
      );
    }

    const { data: ultima, error: ultimaError } = await supabaseAdmin
      .from('categorias')
      .select('orden')
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimaError) throw ultimaError;

    const orden = Number(ultima?.orden ?? 0) + 1;

    const { data, error } = await supabaseAdmin
      .from('categorias')
      .insert([{ nombre, orden }])
      .select('id, nombre, orden')
      .single();

    if (error) {
      if (isSupabaseErrorLike(error) && error.code === '23505') {
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

    const message =
      error instanceof Error ? error.message : 'No se pudo crear la categoría.';

    return NextResponse.json(
      { error: message || 'No se pudo crear la categoría.' },
      { status: 500 }
    );
  }
}