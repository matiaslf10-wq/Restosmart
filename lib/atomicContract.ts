import { NextResponse } from 'next/server';
export function positiveId(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
export type Authority = { adminId: string; email: string; tenantId: string };
export function authorityArgs(a: Authority, restaurant: string) {
  return { p_admin_id: a.adminId, p_email: a.email, p_tenant: a.tenantId, p_restaurant: restaurant };
}
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
export function rpcResponse(data: unknown, error: { code?: string; message?: string } | null, expectedState?: string) {
  if (!error && data && typeof data === 'object' && !Array.isArray(data) &&
      (data as {ok?:unknown}).ok === true && (!expectedState || (data as {state?:unknown}).state === expectedState))
    return NextResponse.json(expectedState === 'declared' ? { state: expectedState, message: 'Pendiente de verificación por el comercio.' } : { ok: true }, { headers });
  const key = error?.code + ':' + error?.message;
  let status = 502;
  let message = 'Resultado no verificable. Actualizá antes de reintentar.';
  if (['PGRST202','42883','42P01','PGRST205'].includes(error?.code ?? '') || key === '55000:B762L_DEPENDENCY') { status = 503; message = 'Integración atómica no disponible.'; }
  else if (key === '42501:B762L_DENIED') { status = 403; message = 'Acceso denegado.'; }
  else if (error?.code === '42501') { status = 503; message = 'Permisos de integración atómica no disponibles.'; }
  else if (key === '22023:B762L_VALIDATION') { status = 400; message = 'Operación inválida.'; }
  else if (['40001:B762L_CONFLICT','23514:B762L_PAYMENT_REQUIRED'].includes(key)) { status = 409; message = 'El pedido o el pago cambiaron. Actualizá la pantalla.'; }
  else if (['40P01','57014','55P03'].includes(error?.code ?? '')) { status = 503; message = 'Operación temporalmente no disponible. Actualizá antes de reintentar.'; }
  return NextResponse.json({ error: message, ...(status === 502 ? { outcome: 'unknown' } : {}) }, { status, headers });
}
