import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(
  'app/api/webhooks/mercadopago/route.ts',
  'utf8'
);

const sql = fs.readFileSync(
  'qa/b7/b722q_billing_atomic_DRAFT.sql',
  'utf8'
);

const start = route.indexOf("if (paymentStatus !== 'approved')");
const end = route.indexOf('// B7.22S:', start);
const nonApproved = start >= 0 && end > start
  ? route.slice(start, end)
  : '';

test('El webhook distingue pagos no aprobados', () => {
  assert.ok(start >= 0 && end > start);
});

test('Un rechazo no cierra ni actualiza el checkout', () => {
  assert.doesNotMatch(nonApproved, /\.update\s*\(/);
  assert.doesNotMatch(nonApproved, /\.upsert\s*\(/);
  assert.doesNotMatch(nonApproved, /\.insert\s*\(/);
  assert.match(nonApproved, /checkout_status_unchanged:\s*true/);
});

test('Un pago no aprobado no reserva mp_payment_id', () => {
  assert.doesNotMatch(nonApproved, /mp_payment_id\s*:/);
});

test('Un pago no aprobado no activa beneficios', () => {
  assert.match(nonApproved, /activated:\s*false/);
  assert.doesNotMatch(
    nonApproved,
    /restosmart_apply_billing_payment_v1/
  );
});

test('Se mantiene la validacion de firma del webhook', () => {
  assert.match(route, /verifyMercadoPagoSignature/);
});

test('Los pagos aprobados usan la RPC atomica', () => {
  assert.match(
    route.slice(end),
    /restosmart_apply_billing_payment_v1/
  );
});

test('La RPC declara bloqueo por identificador de pago', () => {
  assert.match(sql, /restosmart:payment:/);
  assert.match(sql, /pg_advisory_xact_lock/);
});

test('La RPC declara bloqueo por tenant', () => {
  assert.match(sql, /restosmart:tenant:/);
});

test('La RPC comprueba reutilizacion del identificador', () => {
  assert.match(sql, /BILLING_PAYMENT_REUSED/);
});

test('La RPC comprueba antiguedad del checkout', () => {
  assert.match(sql, /BILLING_STALE_CHECKOUT/);
});

test('El borrador conserva indice unico de pagos', () => {
  assert.match(
    sql,
    /billing_checkout_sessions_mp_payment_id_unique/
  );
});