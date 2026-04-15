import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('productos')
      .select('id, categoria, disponible')
      .order('categoria', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('GET /api/stats - error cargando productos:', error);

      return NextResponse.json(
        { error: 'No se pudieron cargar las estadísticas.' },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? [], { status: 200 });
  } catch (error) {
    console.error('GET /api/stats - error inesperado:', error);

    return NextResponse.json(
      { error: 'Ocurrió un error inesperado al cargar las estadísticas.' },
      { status: 500 }
    );
  }
}