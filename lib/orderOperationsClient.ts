'use client';
function endpoint(restaurantId?: string | number | null) {
  return `/api/admin/pedidos-operacion${restaurantId == null ? '' : `?restaurantId=${encodeURIComponent(restaurantId)}`}`;
}
export async function operateOrder(restaurantId: string | number | null | undefined, operation: {
  action: 'estado' | 'caja' | 'cerrar' | 'enviar_cocina' | 'cocina'; pedidoId?: number; pedidoIds?: number[]; itemId?: number; estado?: string;
}) {
  try {
    const response = await fetch(endpoint(restaurantId), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation) });
    const body = await response.json();
    return { error: response.ok ? null : new Error(body.error || 'Operación no autorizada.') };
  } catch { return { error: new Error('No se pudo conectar. Actualizá antes de reintentar.') }; }
}
export async function loadOperationalOrders(restaurantId?: string | number | null) {
  const response = await fetch(endpoint(restaurantId), { cache: 'no-store', credentials: 'same-origin' });
  const body = await response.json();
  return { data: response.ok ? body.pedidos : null, error: response.ok ? null : new Error(body.error || 'Se requiere autorización del personal.') };
}
