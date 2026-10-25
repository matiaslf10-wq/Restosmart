import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
// Preserve order visibility for the desk while keeping unpaid items out of kitchen queues.
export async function maskBlockedKitchen<T extends { id: number; items_pedido?: unknown }>(orders: T[], restaurantId: string): Promise<T[]> {
  if (!orders.length) return orders;
  const { data, error } = await supabaseAdmin.from('order_collections').select('order_id').eq('restaurant_id', restaurantId)
    .eq('require_payment', true).neq('state', 'confirmed').in('order_id', orders.map(order => order.id));
  if (error && ['42P01', 'PGRST205'].includes(error.code)) return orders;
  if (error) throw error;
  const blocked = new Set(data?.map(row => row.order_id));
  return orders.map(order => blocked.has(order.id) ? { ...order, kitchen_blocked: true, items_pedido: Array.isArray(order.items_pedido) ? order.items_pedido.map(item => ({ ...item, comentarios: String(item.comentarios ?? '').replace(/^\[\[COCINA:(pendiente|en_preparacion|listo)\]\]\s*/i, '') })) : order.items_pedido } : order);
}
