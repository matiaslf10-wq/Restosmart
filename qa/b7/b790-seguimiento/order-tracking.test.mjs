import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createOrderTrackingToken, verifyOrderTrackingToken } from '../../../lib/orderTracking.ts';
const key = 'synthetic-offline-secret-only', now = 1700000000000;
test('tracking scope is signed and restricted to exactly one order and branch', () => {
  const token = createOrderTrackingToken(101, '4', key, now);
  assert.deepEqual(verifyOrderTrackingToken(token, '4', key, now), { orderId: 101, restaurantId: '4' });
  assert.equal(verifyOrderTrackingToken(token, '6', key, now), null);
  assert.equal(verifyOrderTrackingToken(token, '4', 'other-secret', now), null);
});
test('tampered order, malformed token and expired token are refused', () => {
  const token = createOrderTrackingToken(101, '4', key, now);
  const [payload, mac] = token.split('.');
  const changed = JSON.parse(Buffer.from(payload, 'base64url')); changed.orderId = 100;
  assert.equal(verifyOrderTrackingToken(Buffer.from(JSON.stringify(changed)).toString('base64url') + '.' + mac, '4', key, now), null);
  for (const bad of [null, '', 'a.b.c', 'x'.repeat(1025)]) assert.equal(verifyOrderTrackingToken(bad, '4', key, now), null);
  assert.equal(verifyOrderTrackingToken(token, '4', key, now + 7 * 86400000), null);
});
test('tracking signatures cannot be reused as administrative session signatures', () => {
  const token = createOrderTrackingToken(101, '4', key, now);
  const [payload, mac] = token.split('.');
  assert.notEqual(mac, createHmac('sha256', key).update(payload).digest('base64url'));
});
test('invalid issuer scope is rejected', () => {
  for (const id of [0, -1, NaN, 1.5]) assert.throws(() => createOrderTrackingToken(id, '4', key, now));
  for (const branch of ['', 'demo', '4/other']) assert.throws(() => createOrderTrackingToken(101, branch, key, now));
});
const source = readFileSync(new URL('../../../app/mostrador/page.tsx', import.meta.url), 'utf8');
const match = source.match(/  async function actualizarEstadoPedido\(pedidoId: number, nuevoEstado: string\) \{([\s\S]*?)\n  \}\n\n  async function enviarItemACocina/);
assert(match, 'actual delivery handler must be tested');
function handler(result = { error: null }) {
  const calls = [];
  const fn = new Function('operateOrder', 'currentRestaurantId', 'setActualizandoPedidoId', 'setMensaje', 'setError', 'formatEstadoLabel', 'cargarDatos',
    'return async function(pedidoId, nuevoEstado) {' + match[1] + '\n}');
  return { calls, run: fn(async (...args) => { calls.push(args); return result; }, '4', () => {}, () => {}, () => {}, String, async () => calls.push('refresh')) };
}
test('actual Entregar handler uses atomic close and refreshes only after success', async () => {
  const h = handler(); await h.run(101, 'cerrado');
  assert.equal(h.calls[0][0], '4'); assert.equal(h.calls[0][1].action, 'cerrar');
  assert.equal(h.calls[0][1].pedidoId, 101); assert.equal(h.calls.at(-1), 'refresh');
});
test('normal status changes keep the state operation', async () => {
  const h = handler(); await h.run(101, 'listo'); assert.equal(h.calls[0][1].action, 'estado');
});
test('failed delivery is not reported as a successful refreshed order', async () => {
  const h = handler({ error: { message: 'synthetic refusal' } }); await h.run(101, 'cerrado');
  assert.equal(h.calls.length, 1);
});
