import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('app/api/webhooks/mercadopago/route.ts','utf8');
const start = src.indexOf("if (paymentStatus !== 'approved')");
const end = src.indexOf('// B7.22S:',start);
const branch = src.slice(start,end);

test('Existe flujo no aprobado', () => {
  assert.ok(start >= 0 && end > start);
});

test('Una notificacion tardia solo actualiza checkouts pendientes', () => {
  assert.match(branch,/\.eq\('status', 'pending'\)/);
  assert.match(branch,/\.eq\('id', session\.id\)/);
});

test('Se detectan errores de actualizacion', () => {
  assert.match(branch,/if \(updateError\)/);
});

test('Una notificacion no aprobada nunca activa beneficios', () => {
  assert.match(branch,/activated: false/);
  assert.doesNotMatch(branch,/restosmart_apply_billing_payment_v1/);
});

test('La aprobacion mantiene firma y RPC', () => {
  assert.match(src,/verifyMercadoPagoSignature/);
  assert.match(src,/restosmart_apply_billing_payment_v1/);
});
