import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL = 7 * 24 * 60 * 60;
export function orderTrackingSecret(): string {
  const secret = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (!secret) throw new Error('ORDER_TRACKING_UNAVAILABLE');
  return secret;
}
function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update('restosmart:order-tracking:v1:' + payload).digest('base64url');
}
export function createOrderTrackingToken(orderId: number, restaurantId: string, secret = orderTrackingSecret(), now = Date.now()): string {
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !/^[1-9][0-9]*$/.test(restaurantId)) throw new Error('INVALID_TRACKING_SCOPE');
  const payload = Buffer.from(JSON.stringify({ audience: 'order-tracking', orderId, restaurantId, exp: Math.floor(now / 1000) + TTL })).toString('base64url');
  return payload + '.' + signature(payload, secret);
}
export function verifyOrderTrackingToken(token: unknown, restaurantId: string, secret = orderTrackingSecret(), now = Date.now()): { orderId: number; restaurantId: string } | null {
  if (typeof token !== 'string' || token.length > 1024 || !/^[1-9][0-9]*$/.test(restaurantId)) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const expected = Buffer.from(signature(parts[0], secret));
    const actual = Buffer.from(parts[1]);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (data.audience !== 'order-tracking' || data.restaurantId !== restaurantId ||
        !Number.isSafeInteger(data.orderId) || data.orderId <= 0 ||
        !Number.isSafeInteger(data.exp) || data.exp <= Math.floor(now / 1000)) return null;
    return { orderId: data.orderId, restaurantId: data.restaurantId };
  } catch { return null; }
}
