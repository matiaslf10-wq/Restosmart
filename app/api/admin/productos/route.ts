import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { resolveAuthorizedAdminAccess } from '@/lib/authorizedAdminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) return auth.response;
  let access;
  try {
    access = await resolveAuthorizedAdminAccess(auth.session, {
      restaurantId: request.nextUrl.searchParams.get('restaurantId'),
      tenantSlug: request.nextUrl.searchParams.get('tenant'),
    });
  } catch {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }
  try {
    const { data: configs, error: configError } = await supabaseAdmin.from('producto_restaurantes')
      .select('producto_id, restaurant_id, visible_en_menu, control_stock, stock_actual, permitir_sin_stock')
      .eq('restaurant_id', access.restaurant!.id);
    if (configError) throw configError;
    if (!configs?.length) return NextResponse.json([]);
    const { data: products, error } = await supabaseAdmin.from('productos')
      .select('id, nombre, descripcion, precio, categoria, disponible, imagen_url, control_stock, stock_actual, permitir_sin_stock, marca_id')
      .in('id', configs.map(row => row.producto_id))
      .order('categoria', { ascending: true }).order('nombre', { ascending: true });
    if (error) throw error;
    const byId = new Map(configs.map(row => [String(row.producto_id), row]));
    return NextResponse.json((products ?? []).map(product => {
      const config = byId.get(String(product.id))!;
      const effective = {
        restaurant_id: String(config.restaurant_id),
        visible_en_menu: config.visible_en_menu !== false,
        control_stock: config.control_stock === true,
        stock_actual: Math.max(0, Math.trunc(Number(config.stock_actual) || 0)),
        permitir_sin_stock: config.permitir_sin_stock !== false,
      };
      return { ...product, control_stock: effective.control_stock,
        stock_actual: effective.stock_actual, permitir_sin_stock: effective.permitir_sin_stock,
        restaurant_ids: effective.visible_en_menu ? [effective.restaurant_id] : [],
        restaurant_configs: [effective] };
    }));
  } catch {
    return NextResponse.json({ error: 'No se pudieron cargar los productos.' }, { status: 500 });
  }
}
