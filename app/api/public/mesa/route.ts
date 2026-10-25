import { NextRequest, NextResponse } from 'next/server';
import { readPublicOrderingContext } from '@/lib/publicOrderingContext';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const numero = Number(request.nextUrl.searchParams.get('numero'));
  if (!Number.isSafeInteger(numero) || numero <= 0) return NextResponse.json({ error: 'Mesa inválida.' }, { status: 400 });
  try {
    const context = await readPublicOrderingContext(request.nextUrl.searchParams.get('restaurantId'));
    if (!context || context.config?.business_mode === 'takeaway') return NextResponse.json({ error: 'Sucursal no disponible para mesas.' }, { status: 404 });
    const { data, error } = await supabaseAdmin.from('mesas')
      .select('id, numero, nombre, restaurant_id').eq('restaurant_id', context.restaurant.id)
      .eq('numero', numero).gt('id', 0).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Mesa no encontrada.' }, { status: 404 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar la mesa.' }, { status: 500 });
  }
}
