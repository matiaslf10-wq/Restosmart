import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, dependencies = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, URL, Set, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  } }, { filename: file });
  return module.exports;
}
const model = load('lib/cobros/model.ts');
const cash = { methods: [{ kind: 'efectivo', label: 'Caja' }], require_payment: false };
test('herencia: override vacío no reactiva medios del tenant', () => {
  assert.equal(model.effectiveConfig(cash, null), cash);
  const branch = { methods: [], require_payment: true };
  assert.equal(model.effectiveConfig(cash, branch), branch);
  assert.equal(model.effectiveConfig(null, null), null);
});
test('URLs: rechaza credenciales, protocolo inseguro, IPs, hosts locales y MP impostor', () => {
  for (const url of ['http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://127.0.0.1', 'https://2130706433', 'https://[::1]', 'https://localhost', 'https://foo.local']) assert.throws(() => model.validPaymentUrl(url, 'externo'));
  assert.throws(() => model.validPaymentUrl('https://mercadopago.com.ar.evil.com', 'mercadopago'));
  assert.equal(model.validPaymentUrl('https://mpago.la/abc', 'mercadopago'), 'https://mpago.la/abc');
  assert.equal(model.validPaymentUrl('https://payments.example.org/pay', 'externo'), 'https://payments.example.org/pay');
});
test('configuración: valida transferencia, booleanos, duplicados; elimina campos no permitidos', () => {
  assert.throws(() => model.validateConfig({ ...cash, require_payment: 'false' }));
  assert.throws(() => model.validateConfig({ ...cash, methods: [...cash.methods, ...cash.methods] }));
  assert.throws(() => model.validateConfig({ ...cash, methods: [{ kind: 'transferencia', alias: 'local' }] }));
  assert.throws(() => model.validateConfig({ ...cash, methods: [{ kind: 'transferencia', alias: 'local', holder: 'Local', account: '123' }] }));
  const result = model.validateConfig({ ...cash, tenant_id: 'attacker', methods: [{ kind: 'transferencia', alias: 'local', holder: 'Comercio', state: 'confirmed' }] });
  assert.equal(result.methods[0].holder, 'Comercio');
  assert.equal(result.tenant_id, undefined);
  assert.equal(result.methods[0].state, undefined);
});
test('matriz de estados: declarar no confirma, resueltos no admiten doble acción', () => {
  assert.equal(model.canTransition('pending', 'declare', 'transferencia'), true);
  assert.equal(model.canTransition('pending', 'confirm', 'transferencia'), false);
  assert.equal(model.canTransition('declared', 'confirm', 'transferencia'), true);
  assert.equal(model.canTransition('pending', 'confirm', 'efectivo'), true);
  assert.equal(model.canTransition('pending', 'declare', 'efectivo'), false);
  for (const state of ['confirmed', 'incident']) for (const action of ['confirm', 'incident', 'declare']) assert.equal(model.canTransition(state, action, 'transferencia'), false);
});

function harness({ authenticated = true, authorized = true, rpcError = null } = {}) {
  const calls = [];
  const query = { select() { return this; }, eq(key, value) { calls.push(['eq', key, value]); return this; }, order() { return this; }, limit() { return Promise.resolve({ data: [], error: null }); } };
  const db = { from(name) { calls.push(['from', name]); return query; }, async rpc(name, args) { calls.push(['rpc', name, args]); return { error: rpcError, data: null }; } };
  const next = { NextResponse: { json(body, options = {}) { return { body, status: options.status ?? 200 }; } } };
  const route = load('app/api/admin/cobros/route.ts', {
    'next/server': next,
    '@/lib/adminAuth': { requireAdminAuth() { return authenticated ? { ok: true, session: { adminId: 'operator', email: 'owner@example.org' } } : { ok: false, response: { status: 401 } }; } },
    '@/lib/authorizedAdminAccess': { async resolveAuthorizedAdminAccess() { if (!authorized) throw new Error('denied'); return { tenantId: 'trusted-tenant', restaurant: { id: '11' } }; } },
    '@/lib/supabaseAdmin': { supabaseAdmin: db },
    '@/lib/cobros/model': model,
    '@/lib/cobros/server': { async readCollectionConfig() { return { tenant: cash, branch: null, effective: cash }; } },
  });
  function request(body) { return { nextUrl: { origin: 'https://local.test', searchParams: new URLSearchParams('restaurantId=999') }, headers: { get() { return 'https://local.test'; } }, async json() { return body; } }; }
  return { route, calls, request };
}
test('API admin: sin sesión o sucursal ajena no llega a la base', async () => {
  for (const options of [{ authenticated: false }, { authorized: false }]) {
    const h = harness(options);
    assert.equal((await h.route.POST(h.request({ action: 'confirm', orderId: 10 }))).status, options.authenticated === false ? 401 : 403);
    assert.equal(h.calls.length, 0);
  }
});
test('API admin: tenant, sucursal y operador provienen de autorización, nunca del body', async () => {
  const h = harness();
  assert.equal((await h.route.POST(h.request({ action: 'confirm', orderId: 10, tenant: 'evil', restaurantId: 999, operator: 'evil', amount: 1 }))).status, 200);
  const args = h.calls.find(call => call[0] === 'rpc')[2];
  assert.equal(args.p_tenant, 'trusted-tenant'); assert.equal(args.p_restaurant, '11'); assert.equal(args.p_operator, 'operator:owner@example.org'); assert.equal(args.p_token, null); assert.equal(args.amount, undefined);
});
test('API admin: listado filtra todos los registros por tenant Y sucursal', async () => {
  const h = harness(); await h.route.GET(h.request());
  assert.equal(h.calls.filter(call => call[0] === 'eq' && call[1] === 'tenant_id' && call[2] === 'trusted-tenant').length, 2);
  assert.equal(h.calls.filter(call => call[0] === 'eq' && call[1] === 'restaurant_id' && call[2] === '11').length, 2);
});
test('API admin: conflicto devuelve 409, no repite la confirmación', async () => {
  const h = harness({ rpcError: { message: 'B724_TRANSITION' } });
  assert.equal((await h.route.POST(h.request({ action: 'confirm', orderId: 10 }))).status, 409);
  assert.equal(h.calls.filter(call => call[0] === 'rpc').length, 1);
});
test('API admin: rechaza acciones, IDs, incidencia vacía y configuración inválida', async () => {
  for (const body of [null, { action: 'approve', orderId: 1 }, { action: 'confirm', orderId: '1' }, { action: 'incident', orderId: 1, note: '' }, { action: 'config', scope: 'evil', config: cash }]) {
    const h = harness(); assert.equal((await h.route.POST(h.request(body))).status, 400); assert.equal(h.calls.length, 0);
  }
});
test('SQL: inspección estática solamente; RLS, privilegios, locks y sin backfill', () => {
  const sql = fs.readFileSync('qa/b7/b724_order_collections_DRAFT.sql', 'utf8');
  for (const table of ['order_collection_configs', 'order_collections', 'order_collection_events']) assert.ok(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
  assert.match(sql, /FOR UPDATE/); assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /B724_PAYMENT_REQUIRED/); assert.match(sql, /p_token IS DISTINCT FROM p.token/);
  assert.doesNotMatch(sql, /tenant_subscriptions|billing_checkout_sessions|access_token|mercadopago_access/i);
});

test('API pública: solo declara; ignora acción, importe y ámbito manipulados', async () => {
  const calls = [];
  const db = {
    from() { return { select() { return this; }, eq(key, value) { calls.push([key, value]); return this; }, async maybeSingle() { return { data: { order_id: 12, tenant_id: 'owner', restaurant_id: 22 } }; } }; },
    async rpc(name, args) { calls.push(['rpc', args]); return { error: null }; },
  };
  const route = load('app/api/public/cobros/route.ts', {
    'next/server': { NextResponse: { json(body, options = {}) { return { body, status: options.status ?? 200 }; } } },
    '@/lib/supabaseAdmin': { supabaseAdmin: db }, '@/lib/cobros/server': {},
  });
  const token = 'd76f6111-4b2b-413b-b092-8336f9c516a7';
  const response = await route.POST({ nextUrl: { origin: 'https://local.test' }, headers: { get() { return null; } }, async json() { return { token, action: 'confirm', tenant_id: 'evil', restaurant_id: 999, amount: 0, state: 'confirmed' }; } });
  assert.equal(response.status, 200); assert.equal(response.body.state, 'declared');
  assert.equal(calls[0][0], 'token'); assert.equal(calls[0][1], token);
  const args = calls.find(call => call[0] === 'rpc')[1];
  assert.equal(args.p_action, 'declare'); assert.equal(args.p_tenant, 'owner'); assert.equal(args.p_restaurant, 22); assert.equal(args.p_operator, 'customer');
});
test('configuración: solo tabla ausente permite compatibilidad; fallo de DB falla cerrado', async () => {
  for (const code of ['42P01', 'PGRST205', '42501', '08006']) {
    const api = load('lib/cobros/server.ts', {
      'server-only': {}, './model': model,
      '@/lib/supabaseAdmin': { supabaseAdmin: { from() { return { select() { return this; }, eq() { return this; }, async in() { return { error: { code } }; } }; } } },
    });
    if (['42P01', 'PGRST205'].includes(code)) assert.equal((await api.readCollectionConfig('owner', '11')).effective, null);
    else await assert.rejects(() => api.readCollectionConfig('owner', '11'));
  }
});
test('cocina: oculta marcadores pendientes y conserva pedidos acreditados e históricos', async () => {
  const filters = [];
  const api = load('lib/cobros/kitchen.ts', {
    'server-only': {}, '@/lib/supabaseAdmin': { supabaseAdmin: { from() { return { select() { return this; }, eq(...args) { filters.push(args); return this; }, neq() { return this; }, async in() { return { data: [{ order_id: 10 }], error: null }; } }; } } },
  });
  const orders = [{ id: 10, items_pedido: [{ comentarios: '[[COCINA:pendiente]] Sin sal' }] }, { id: 11, items_pedido: [{ comentarios: '[[COCINA:pendiente]] Listo para preparar' }] }];
  const result = await api.maskBlockedKitchen(orders, '22');
  assert.equal(result[0].kitchen_blocked, true); assert.equal(result[0].items_pedido[0].comentarios, 'Sin sal');
  assert.equal(result[1], orders[1]); assert.match(orders[0].items_pedido[0].comentarios, /COCINA/);
  assert.equal(filters[0][0], 'restaurant_id'); assert.equal(filters[0][1], '22');
});
