// Application authorization tests with an in-memory query double.
// No network, no real keys; these do NOT certify grants, RLS or Storage policies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '../..');

function setup() {
  const tables = {
    admin_users: [{ id: 'admin-A', email: 'a@test.local', tenant_id: 'tenant-A', activo: true }],
    restaurants: [
      { id: 'branch-A', slug: 'a', owner_tenant_id: 'tenant-A', estado: 'activo' },
      { id: 'branch-A2', slug: 'a2', owner_tenant_id: 'tenant-A', estado: 'activo' },
      { id: 'branch-B', slug: 'b', owner_tenant_id: 'tenant-B', estado: 'activo' },
      { id: 'closed', owner_tenant_id: 'tenant-A', estado: 'pausado' },
    ],
    configuracion_local: [{ restaurant_id: 'branch-A', nombre_local: 'A', business_mode: 'restaurant', private: 'secret' }],
    mesas: [{ id: 10, numero: 1, restaurant_id: 'branch-A', nombre: 'Uno', private: 'secret' }],
    productos: [{ id: 1, marca_id: 'brand-A' }, { id: 2, marca_id: 'brand-B' }],
    producto_restaurantes: [{ producto_id: 1, restaurant_id: 'branch-A' }, { producto_id: 2, restaurant_id: 'branch-B' }],
    marcas: [{ id: 'brand-A', tenant_id: 'tenant-A', activa: true, nombre: 'A' }, { id: 'brand-B', tenant_id: 'tenant-B', activa: true, nombre: 'B' }],
    producto_imagenes: [{ id: 11, producto_id: 1, image_url: 'https://images.local/a', storage_path: '1/a.jpg', es_portada: true, orden: 1 }, { id: 22, producto_id: 2, image_url: 'https://images.local/b' }],
  };
  const calls = [];
  const db = { from(table) {
    assert.ok(table in tables, `Unexpected table ${table}`);
    const call = { table, filters: [], write: false }; calls.push(call);
    let columns = '*', single = false, limit = Infinity;
    const q = {
      select(c) { columns = c; return q; },
      eq(k, v) { call.filters.push(r => String(r[k]) === String(v)); return q; },
      ilike(k, v) { call.filters.push(r => String(r[k]).toLowerCase() === String(v).toLowerCase()); return q; },
      neq(k, v) { call.filters.push(r => r[k] !== v); return q; },
      gt(k, v) { call.filters.push(r => r[k] > v); return q; },
      in(k, values) { call.filters.push(r => values.map(String).includes(String(r[k]))); return q; },
      order() { return q; }, limit(n) { limit = n; return q; },
      maybeSingle() { single = true; return q; }, single() { single = true; return q; },
      update(payload) { call.write = true; call.payload = payload; return q; },
      insert(payload) { call.write = true; call.payload = payload; return q; },
      delete() { call.write = true; return q; },
      then(resolve, reject) {
        let rows = tables[table].filter(r => call.filters.every(f => f(r))).slice(0, limit);
        if (columns !== '*') rows = rows.map(r => Object.fromEntries(columns.split(',').map(c => c.trim()).filter(c => c in r).map(c => [c, r[c]])));
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
      },
    }; return q;
  } };
  const cache = new Map();
  const next = { NextResponse: { json(body, options = {}) { return { body, status: options.status ?? 200 }; } } };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const mod = { exports: {} }; cache.set(file, mod.exports);
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(compiled, {
      module: mod, exports: mod.exports, Buffer, console: { log() {}, error() {} },
      process: { env: { ADMIN_SESSION_SECRET: 'local-test-only-not-a-real-secret' } },
      require(name) {
        if (name === 'server-only') return {};
        if (name === 'crypto') return require('node:crypto');
        if (name === 'next/server') return next;
        if (name === '@/lib/supabaseAdmin') return { supabaseAdmin: db };
        if (name === '@/lib/adminAccess') return { async resolveAdminAccess({ restaurantId }) {
          const restaurant = tables.restaurants.find(r => r.id === restaurantId);
          return { restaurant, tenantId: restaurant.owner_tenant_id, plan: 'pro', capabilities: {} };
        } };
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
        throw Error(`Unexpected import ${name}`);
      },
    }, { filename: file });
    return mod.exports;
  }
  const auth = load('lib/adminAuth.ts');
  const token = auth.createAdminSessionToken({ adminId: 'admin-A', email: 'a@test.local', tenantId: 'tenant-A' });
  function request(query = 'restaurantId=branch-A', body = {}, authenticated = true) {
    return { nextUrl: new URL('https://local.test/api?' + query), headers: new Headers(),
      cookies: { get(name) { return name === 'restosmart_admin_session' && authenticated ? { value: token } : undefined; }, getAll() { return []; } },
      async json() { return body; },
    };
  }
  return { load, request, tables, calls, auth, token };
}
const images = 'app/api/admin/productos/[id]/imagenes/route.ts';
const params = id => ({ params: Promise.resolve({ id: String(id) }) });

test('signed session: tampered token is rejected', () => {
  const s = setup(); assert.equal(s.auth.verifyAdminSessionToken(s.token + 'x'), null);
});
test('no session: image reads, cover writes and uploads fail before SQL', async () => {
  const s = setup(), route = s.load(images);
  for (const method of ['GET', 'PUT', 'POST']) assert.equal((await route[method](s.request('', {}, false), params(1))).status, 401);
  assert.equal(s.calls.length, 0);
});
test('foreign tenant selection and foreign branch are rejected by real access resolver', async () => {
  for (const query of ['restaurantId=branch-B', 'restaurantId=branch-A&tenant=tenant-B']) {
    const s = setup(); const res = await s.load(images).PUT(s.request(query, { imageId: 11 }), params(1));
    assert.equal(res.status, 403); assert.ok(s.calls.every(c => !c.write));
  }
});
test('same tenant, other branch: product association is required', async () => {
  const s = setup(); assert.equal((await s.load(images).GET(s.request('restaurantId=branch-A2'), params(1))).status, 404);
  assert.ok(s.calls.every(c => !c.write));
});
test('foreign product and foreign image cannot mutate', async () => {
  const s = setup(), route = s.load(images);
  assert.equal((await route.PUT(s.request('', { imageId: 22 }), params(2))).status, 404);
  assert.equal((await route.PUT(s.request('restaurantId=branch-A', { imageId: 22 }), params(1))).status, 404);
  assert.ok(s.calls.every(c => !c.write));
});
test('authorized cover uses stored URL and scopes all writes to product', async () => {
  const s = setup(); assert.equal((await s.load(images).PUT(s.request('restaurantId=branch-A', { imageId: 11, image_url: 'evil', tenant: 'tenant-B' }), params(1))).status, 200);
  const writes = s.calls.filter(c => c.write);
  assert.equal(writes.length, 3);
  assert.equal(writes[0].payload.imagen_url, 'https://images.local/a');
  assert.ok(writes[1].filters.every(f => f({ producto_id: 1 })));
  assert.ok(writes[1].filters.some(f => !f({ producto_id: 2 })));
});
test('Storage upload is blocked even for authorized owner', async () => {
  const s = setup(); assert.equal((await s.load(images).POST(s.request(), params(1))).status, 409);
  assert.ok(s.calls.every(c => !c.write));
});
test('cross-tenant shared product is denied even with a local branch link', async () => {
  const s = setup();
  s.tables.producto_restaurantes.push({ producto_id: 1, restaurant_id: 'branch-B' });
  assert.equal((await s.load(images).PUT(s.request(), params(1))).status, 404);
  assert.ok(s.calls.every(c => !c.write));
});
test('product with images cannot delete metadata or Storage implicitly', async () => {
  const s = setup();
  assert.equal((await s.load('app/api/productos/[id]/route.ts').DELETE(s.request(), params(1))).status, 409);
  assert.ok(s.calls.every(c => !c.write));
});
test('public context returns minimal config and only tenant brands', async () => {
  const s = setup(), route = s.load('app/api/public/contexto/route.ts');
  const res = await route.GET(s.request('restaurantId=branch-A', {}, false));
  assert.equal(res.status, 200); assert.equal(res.body.marcas.length, 1);
  assert.equal(res.body.marcas[0].id, 'brand-A');
  assert.equal(JSON.stringify(res.body).includes('tenant_id'), false);
  assert.equal(JSON.stringify(res.body).includes('secret'), false);
  assert.ok(s.calls.every(c => !c.write));
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal(route[method], undefined);
});
test('public mesa is scoped to branch and rejects virtual, closed and takeaway', async () => {
  const s = setup(), route = s.load('app/api/public/mesa/route.ts');
  assert.equal((await route.GET(s.request('restaurantId=branch-A&numero=1', {}, false))).status, 200);
  for (const [query, status] of [['restaurantId=branch-B&numero=1', 404], ['restaurantId=branch-A&numero=0', 400], ['restaurantId=closed&numero=1', 404], ['numero=1', 404]]) {
    assert.equal((await route.GET(s.request(query, {}, false))).status, status);
  }
  s.tables.configuracion_local[0].business_mode = 'takeaway';
  assert.equal((await route.GET(s.request('restaurantId=branch-A&numero=1', {}, false))).status, 404);
  assert.ok(s.calls.every(c => !c.write));
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal(route[method], undefined);
});
test('four components have no direct SQL or Storage client', () => {
  for (const file of ['app/admin/marcas/page.tsx', 'app/admin/productos/page.tsx', 'app/pedir/page.tsx', 'app/mesa/[mesaId]/page.tsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /supabaseClient|supabase\s*\.|\.from\(['"](?:mesas|restaurants|configuracion_local|marcas|productos|producto_imagenes)['"]\)/);
  }
});

test('existing product mutation endpoints reject public callers without SQL', async () => {
  const s = setup();
  const single = s.load('app/api/productos/[id]/route.ts');
  const list = s.load('app/api/productos/route.ts');
  for (const method of ['PUT', 'DELETE']) assert.equal((await single[method](s.request('', {}, false), params(1))).status, 401);
  assert.equal((await list.POST(s.request('', {}, false))).status, 401);
  assert.equal(s.calls.length, 0);
});
test('product PUT and DELETE reject product belonging to another branch', async () => {
  const s = setup(), route = s.load('app/api/productos/[id]/route.ts');
  for (const method of ['PUT', 'DELETE']) assert.equal((await route[method](s.request('restaurantId=branch-A2'), params(1))).status, 404);
  assert.ok(s.calls.every(c => !c.write));
});
test('availability toggle requires session and exact product branch', async () => {
  const s = setup(), route = s.load('app/api/productos/[id]/disponible/route.ts');
  assert.equal((await route.PUT(s.request('', {}, false), params(1))).status, 401);
  assert.equal(s.calls.length, 0);
  assert.equal((await route.PUT(s.request('restaurantId=branch-A2', { disponible: true }), params(1))).status, 404);
  assert.ok(s.calls.every(c => !c.write));
  assert.equal((await route.PUT(s.request('restaurantId=branch-A', { disponible: true }), params(1))).status, 200);
  assert.equal(s.calls.filter(c => c.write).length, 1);
});
test('admin product listing authenticates and isolates selected branch', async () => {
  const s = setup(), route = s.load('app/api/admin/productos/route.ts');
  assert.equal((await route.GET(s.request('', {}, false))).status, 401);
  assert.equal(s.calls.length, 0);
  assert.equal((await route.GET(s.request('restaurantId=branch-B'))).status, 403);
  const res = await route.GET(s.request());
  assert.equal(res.status, 200); assert.equal(res.body.length, 1);
  assert.equal(res.body[0].id, 1);
  assert.equal(res.body[0].restaurant_configs.length, 1);
  assert.equal(res.body[0].restaurant_configs[0].restaurant_id, 'branch-A');
});
test('product creation validates foreign branch before inserting any row', async () => {
  const s = setup();
  const res = await s.load('app/api/productos/route.ts').POST(s.request('restaurantId=branch-A', {
    nombre: 'Test', categoria: 'Test', precio: 10,
    restaurant_ids: ['branch-B'], tenant: 'tenant-B', role: 'owner',
  }));
  assert.equal(res.status, 403); assert.ok(s.calls.every(c => !c.write));
});
test('public products require a live restaurant and expose only its configuration', async () => {
  const s = setup(), route = s.load('app/api/productos/route.ts');
  s.tables.producto_restaurantes[0].visible_en_menu = true;
  s.tables.producto_restaurantes.push({ producto_id: 1, restaurant_id: 'branch-A2', visible_en_menu: true });
  const res = await route.GET(s.request('restaurantId=branch-A', {}, false));
  assert.equal(res.status, 200); assert.equal(res.body.length, 1);
  assert.equal(res.body[0].restaurant_configs.length, 1);
  assert.equal(res.body[0].restaurant_configs[0].restaurant_id, 'branch-A');
  assert.equal((await route.GET(s.request('restaurantId=closed', {}, false))).status, 403);
  assert.equal((await route.GET(s.request('', {}, false))).status, 400);
  assert.ok(s.calls.every(c => !c.write));
});
