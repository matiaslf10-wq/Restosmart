// Pruebas locales con dobles de las dependencias. No conectan a Supabase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const loadModule = createRequire(import.meta.url);
const ts = loadModule('typescript');
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, '../..', 'app/api/admin/pedidos-operacion/route.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function setup({ authenticated = true, authorized = true, orders = [{ id: 10, estado: 'pendiente' }], items = [] } = {}) {
  const calls = [];
  const accessCalls = [];
  const admin = { from(table) {
    const call = { table, filters: [], payload: null };
    calls.push(call);
    const query = {
      select() { return query; }, order() { return query; },
      eq(...args) { call.filters.push(['eq', ...args]); return query; },
      in(...args) { call.filters.push(['in', ...args]); return query; },
      is(...args) { call.filters.push(['is', ...args]); return query; },
      update(payload) { call.payload = payload; return query; },
      then(resolve, reject) { return Promise.resolve({ data: call.payload ? [{ id: table === 'pedidos' ? 10 : 1 }] : table === 'pedidos' ? orders : items, error: null }).then(resolve, reject); },
    };
    return query;
  } };
  const routeModule = { exports: {} };
  vm.runInNewContext(compiled, { module: routeModule, exports: routeModule.exports, require(name) {
    if (name === 'next/server') return { NextResponse: { json(body, options = {}) { return { body, status: options.status ?? 200, headers: options.headers }; } } };
    if (name === '@/lib/adminAuth') return { requireAdminAuth() { return authenticated ? { ok: true, session: { adminId: 'staff' } } : { ok: false, response: { status: 401 } }; } };
    if (name === '@/lib/authorizedAdminAccess') return { async resolveAuthorizedAdminAccess(session, requested) {
      accessCalls.push({ session, requested });
      if (!authorized) throw Error('Denied');
      return { restaurant: { id: 'restaurant-A' } };
    } };
    if (name === '@/lib/supabaseAdmin') return { supabaseAdmin: admin };
    throw Error('Unexpected import: ' + name);
  } });
  function request(body, origin = 'https://local.test') {
    return { nextUrl: new URL('https://local.test/api/admin/pedidos-operacion?restaurantId=restaurant-B'), headers: new Headers({ origin }), async json() { return body; } };
  }
  return { route: routeModule.exports, calls, accessCalls, request };
}

test('GET y POST sin sesión no consultan tablas', async () => {
  const s = setup({ authenticated: false });
  assert.equal((await s.route.GET(s.request())).status, 401);
  assert.equal((await s.route.POST(s.request({ action: 'cerrar', pedidoId: 10 }))).status, 401);
  assert.equal(s.calls.length, 0);
});
test('El restaurantId solicitado pasa por autorización; rechazo sin lecturas', async () => {
  const s = setup({ authorized: false });
  assert.equal((await s.route.GET(s.request())).status, 403);
  assert.equal(s.accessCalls[0].requested.restaurantId, 'restaurant-B');
  assert.equal(s.calls.length, 0);
});
test('GET filtra por el restaurante autorizado, no por el ID recibido', async () => {
  const s = setup();
  assert.equal((await s.route.GET(s.request())).status, 200);
  assert.ok(s.calls[0].filters.some(f => f[1] === 'restaurant_id' && f[2] === 'restaurant-A'));
});
test('Pedido ajeno o histórico no permite escrituras', async () => {
  const s = setup({ orders: [] });
  assert.equal((await s.route.POST(s.request({ action: 'cerrar', pedidoId: 10 }))).status, 409);
  assert.ok(s.calls.every(c => !c.payload));
});
test('Un lote mixto falla antes de mutar', async () => {
  const s = setup();
  assert.equal((await s.route.POST(s.request({ action: 'cerrar', pedidoIds: [10, 99] }))).status, 409);
  assert.ok(s.calls.every(c => !c.payload));
});
test('Ítem de otro pedido se rechaza sin escritura', async () => {
  const s = setup({ items: [{ id: 1, comentarios: 'Nota' }] });
  assert.equal((await s.route.POST(s.request({ action: 'enviar_cocina', pedidoId: 10, itemId: 99 }))).status, 409);
  assert.ok(s.calls.every(c => !c.payload));
});
test('Tomar cocina preserva ítems listos y comentarios almacenados', async () => {
  const s = setup({ items: [{ id: 1, comentarios: '[[COCINA:pendiente]] Sin sal' }, { id: 2, comentarios: '[[COCINA:listo]] Ya listo' }] });
  assert.equal((await s.route.POST(s.request({ action: 'cocina', pedidoId: 10, estado: 'en_preparacion' }))).status, 200);
  const writes = s.calls.filter(c => c.table === 'items_pedido' && c.payload);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.comentarios, '[[COCINA:en_preparacion]] Sin sal');
  assert.ok(writes[0].filters.some(f => f[1] === 'pedido_id' && f[2] === 10));
});
test('Reenviar a cocina no reinicia estados individuales', async () => {
  const s = setup({ items: [{ id: 1, comentarios: '[[COCINA:listo]] Listo' }] });
  assert.equal((await s.route.POST(s.request({ action: 'enviar_cocina', pedidoId: 10 }))).status, 200);
  assert.ok(s.calls.every(c => c.table !== 'items_pedido' || !c.payload));
});
test('No admite operación arbitraria ni aprobación de pago', async () => {
  const s = setup();
  assert.equal((await s.route.POST(s.request({ action: 'aprobar_pago', pedidoId: 10, estado_pago: 'aprobado' }))).status, 400);
  assert.equal(s.calls.length, 0);
});
test('Los campos de pago adicionales no se incorporan a las mutaciones', async () => {
  const s = setup();
  assert.equal((await s.route.POST(s.request({ action: 'estado', pedidoId: 10, estado: 'listo', estado_pago: 'aprobado', efectivo_aprobado: true }))).status, 200);
  const payload = s.calls.find(c => c.payload).payload;
  assert.equal(payload.estado, 'listo');
  assert.equal(Object.hasOwn(payload, 'estado_pago'), false);
  assert.equal(Object.hasOwn(payload, 'efectivo_aprobado'), false);
});
test('Rechaza mutaciones de otro origen', async () => {
  const s = setup();
  assert.equal((await s.route.POST(s.request({ action: 'cerrar', pedidoId: 10 }, 'https://otro.test'))).status, 403);
  assert.equal(s.calls.length, 0);
});
