import { NextRequest, NextResponse } from 'next/server';
import { readPublicOrderingContext } from '@/lib/publicOrderingContext';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const context = await readPublicOrderingContext(request.nextUrl.searchParams.get('restaurantId'));
    if (!context) return NextResponse.json({ error: 'Sucursal no disponible.' }, { status: 404 });
    const { data: marcas, error } = await supabaseAdmin.from('marcas')
      .select('id, nombre, descripcion, logo_url, color_hex, activa, orden')
      .eq('tenant_id', context.restaurant.owner_tenant_id).eq('activa', true)
      .order('orden', { ascending: true }).order('nombre', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ config: context.config, marcas: marcas ?? [] });
  } catch {
    return NextResponse.json({ error: 'No se pudo cargar el contexto del local.' }, { status: 500 });
  }
}
