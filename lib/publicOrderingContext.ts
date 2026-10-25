import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Explicit restaurant selection only: never fall back to a tenant or global row.
export async function readPublicOrderingContext(restaurantId: string | null) {
  if (!restaurantId || restaurantId.length > 128) return null;
  const { data: restaurant, error } = await supabaseAdmin.from('restaurants')
    .select('id, owner_tenant_id, estado').eq('id', restaurantId).maybeSingle();
  if (error) throw error;
  if (!restaurant?.owner_tenant_id || ['cerrado', 'pausado'].includes(String(restaurant.estado).trim().toLowerCase())) return null;
  const { data: config, error: configError } = await supabaseAdmin.from('configuracion_local')
    .select('nombre_local, direccion, horario_atencion, business_mode')
    .eq('restaurant_id', restaurant.id).limit(1).maybeSingle();
  if (configError) throw configError;
  return { restaurant, config };
}
