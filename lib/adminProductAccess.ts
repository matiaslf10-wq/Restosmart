import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { AdminAccessSnapshot } from '@/lib/adminAccess';

export async function ownsProductInRestaurant(productId: number, access: AdminAccessSnapshot) {
  if (!Number.isSafeInteger(productId) || productId <= 0 || !access.restaurant?.id) return false;
  const { data: link, error } = await supabaseAdmin.from('producto_restaurantes')
    .select('producto_id').eq('producto_id', productId)
    .eq('restaurant_id', access.restaurant.id).maybeSingle();
  if (error) throw error;
  if (!link) return false;
  const { data: product, error: productError } = await supabaseAdmin.from('productos')
    .select('id, marca_id').eq('id', productId).maybeSingle();
  if (productError) throw productError;
  if (!product) return false;
  // Global product rows must not be writable through a link shared across tenants.
  const { data: links, error: linksError } = await supabaseAdmin.from('producto_restaurantes')
    .select('restaurant_id').eq('producto_id', productId);
  if (linksError) throw linksError;
  const restaurantIds = [...new Set((links ?? []).map(row => String(row.restaurant_id)))];
  const { data: restaurants, error: restaurantsError } = await supabaseAdmin.from('restaurants')
    .select('id, owner_tenant_id').in('id', restaurantIds);
  if (restaurantsError) throw restaurantsError;
  if (restaurants?.length !== restaurantIds.length || restaurants.some(row => row.owner_tenant_id !== access.tenantId)) return false;
  if (product.marca_id) {
    const { data: brand, error: brandError } = await supabaseAdmin.from('marcas')
      .select('id').eq('id', product.marca_id).eq('tenant_id', access.tenantId).maybeSingle();
    if (brandError) throw brandError;
    if (!brand) return false;
  }
  return true;
}
