// Historical money comes only from pedidos.total, never the live catalogue.
export function persistedOrderTotal(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))) return null;
  const total = Number(value);
  return Number.isFinite(total) && total >= 0 && total <= Number.MAX_SAFE_INTEGER / 100 ? total : null;
}

export function persistedAccountTotal(orders: { total: unknown }[]): number | null {
  let sum = 0;
  for (const order of orders) {
    const total = persistedOrderTotal(order.total);
    if (total === null) return null;
    sum += total;
    if (sum > Number.MAX_SAFE_INTEGER / 100) return null;
  }
  return sum;
}
