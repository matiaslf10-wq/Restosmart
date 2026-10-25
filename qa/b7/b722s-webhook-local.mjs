import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('app/api/webhooks/mercadopago/route.ts', 'utf8');

test('Webhook utiliza RPC atomica', () => {
  assert.match(source, /restosmart_apply_billing_payment_v1/);
  assert.match(source, /supabaseAdmin\.rpc/);
});

test('No conserva activacion no transaccional', () => {
  assert.doesNotMatch(source, /applyApprovedCheckout/);
  assert.doesNotMatch(source, /async function setTenantAddon/);
});

test('Conserva validacion del pago', () => {
  assert.match(source, /verifyMercadoPagoSignature/);
  assert.match(source, /expectedAmount/);
  assert.match(source, /paidAmount/);
  assert.match(source, /paidCurrency/);
});

test('Pasa identidad del pago a la RPC', () => {
  assert.match(source, /p_external_reference/);
  assert.match(source, /p_payment_id/);
  assert.match(source, /p_amount/);
  assert.match(source, /p_currency/);
});
