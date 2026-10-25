import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('qa/b7/b722q_billing_atomic_DRAFT.sql', 'utf8');

test('RPC restringida a service_role', () => {
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /REVOKE ALL ON FUNCTION/);
  assert.match(sql, /TO service_role/);
});

test('Serializacion de pagos', () => {
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /FOR UPDATE/);
});

test('Importe y moneda', () => {
  assert.match(sql, /BILLING_PAYMENT_MISMATCH/);
});

test('Suscripciones sin columna mp_payment_id', () => {
  const section = sql.split('INSERT INTO public.tenant_subscriptions')[1].split('UPDATE public.restaurants')[0];
  assert.doesNotMatch(section, /mp_payment_id/);
});

test('Pago conservado en checkout', () => {
  assert.match(sql, /mp_payment_id = p_payment_id/);
});

test('Checkouts antiguos rechazados', () => {
  assert.match(sql, /BILLING_STALE_CHECKOUT/);
});

test('Identificador de pago unico en PostgreSQL', () => {
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_sessions_mp_payment_id_unique/);
  assert.match(sql, /ON public\.billing_checkout_sessions \(mp_payment_id\)/);
});
