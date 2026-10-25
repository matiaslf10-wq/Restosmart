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
  const objects = []; const failures = {};
  const db = { storage: { from(bucket) { assert.equal(bucket, 'productos'); return { async upload(path, bytes, options) { objects.push({ path, bytes, options }); return { error: failures.upload ? new Error('upload') : null }; }, getPublicUrl(path) { return { data: { publicUrl: 'https://images.local/' + path } }; }, remove() { throw new Error('Physical deletion forbidden'); } }; } }, from(table) {
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
      insert(payload) { call.write = true; call.payload = payload; call.insert = true; return q; },
      delete() { call.write = true; call.delete = true; return q; },
      then(resolve, reject) {
        if (call.write && failures[table]) return Promise.resolve({ data: null, error: new Error('injected') }).then(resolve, reject);
        if (call.insert) { const row = { id: 100, ...call.payload }; tables[table].push(row); }
        let rows = tables[table].filter(r => call.filters.every(f => f(r))).slice(0, limit);
        if (call.write && !call.insert && !call.delete) rows.forEach(r => Object.assign(r, call.payload));
        if (call.delete) tables[table] = tables[table].filter(r => !rows.includes(r));
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
      module: mod, exports: mod.exports, Buffer, Response, console: { log() {}, error() {} },
      process: { env: { ADMIN_SESSION_SECRET: 'local-test-only-not-a-real-secret' } },
      require(name) {
        if (name === 'server-only') return {};
        if (name === 'crypto') return require('node:crypto');
        if (name === 'next/server') return next;
        if (name === '@/lib/supabaseAdmin') return { supabaseAdmin: db };
        if (name === '@/lib/adminAccess') return { async resolveAdminAccess({ restaurantId }) {
          const restaurant = tables.restaurants.find(r => r.id === restaurantId);
          return { restaurant, tenantId: restaurant.owner_tenant_id, plan: 'pro', capabilities: { multi_brand: true } };
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
  return { load, request, tables, calls, auth, token, objects, failures };
}

const images = 'app/api/admin/productos/[id]/imagenes/route.ts';
const logos = 'app/api/admin/marcas/[id]/logo/route.ts';
const params = id => ({ params: Promise.resolve({ id: String(id) }) });
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
function upload(s, bytes = png, mime = 'image/png', extra = null) {
  const req = s.request(); req.headers.set('content-type', 'multipart/form-data');
  const form = new FormData(); form.append('file', new Blob([bytes], { type: mime }), '../../evil.svg');
  if (extra) form.append('storage_path', extra);
  req.formData = async () => form; return req;
}
test('no session, foreign tenant/product/brand: no Storage writes', async () => {
  for (const [route, id, query, authenticated, status] of [[images,1,'',false,401],[images,2,'restaurantId=branch-A',true,404],[images,1,'restaurantId=branch-B',true,403],[logos,'brand-B','restaurantId=branch-A',true,404],[logos,'brand-A','',false,401]]) {
    const s=setup(), req=upload(s); const base=s.request(query,{},authenticated); req.cookies=base.cookies; req.nextUrl=base.nextUrl;
    assert.equal((await s.load(route).POST(req,params(id))).status,status); assert.equal(s.objects.length,0); assert.ok(s.calls.every(c=>!c.write));
  }
});
test('invalid, empty, oversized, MIME mismatch and manipulated path rejected', async () => {
  for (const [bytes,mime,extra] of [[Buffer.from('<svg/>'),'image/svg+xml'],[Buffer.from('<html>'),'image/png'],[Buffer.alloc(0),'image/png'],[Buffer.alloc(5*1024*1024+1),'image/png'],[png,'image/jpeg'],[png,'image/png','2/other.jpg']]) {
    const s=setup(); assert.equal((await s.load(images).POST(upload(s,bytes,mime,extra),params(1))).status,400); assert.equal(s.objects.length,0); assert.ok(s.calls.every(c=>!c.write));
  }
});
test('simulated upload: assigned extension, MIME, random safe tenant path, no upsert', async () => {
  const s=setup(), route=s.load(images);
  for(let i=0;i<2;i++) assert.equal((await route.POST(upload(s),params(1))).status,201);
  assert.notEqual(s.objects[0].path,s.objects[1].path);
  assert.match(s.objects[0].path, new RegExp('^tenants/[a-f0-9]{64}/productos/[a-f0-9]{64}/[a-f0-9-]+[.]png$'));
  assert.equal(s.objects[0].options.contentType,'image/png'); assert.equal(s.objects[0].options.upsert,false);
  assert.equal(s.tables.producto_imagenes.at(-1).producto_id,1);
});
test('simulated owned brand upload updates only authorized brand', async () => {
  const s=setup(); assert.equal((await s.load(logos).POST(upload(s),params('brand-A'))).status,201);
  assert.match(s.tables.marcas[0].logo_url,/tenants/); assert.equal(s.tables.marcas[1].logo_url,undefined);
});
test('upload failure prevents metadata; metadata failure retains object for reconciliation', async () => {
  for (const failure of ['upload','producto_imagenes']) { const s=setup(); s.failures[failure]=true;
    assert.equal((await s.load(images).POST(upload(s),params(1))).status,500);
    assert.equal(s.tables.producto_imagenes.length,2);
  }
});
test('delete rejects manipulated paths and foreign images', async () => {
  for (const [body,status] of [[{imageId:11,storage_path:'2/a.jpg'},400],[{imageId:22},404]]) { const s=setup(); assert.equal((await s.load(images).DELETE(s.request('restaurantId=branch-A',body),params(1))).status,status); assert.ok(s.calls.every(c=>!c.write)); }
});
test('historical shared object retained; cover cleared before unlink; other references survive', async () => {
  const s=setup(); s.tables.productos[0].imagen_url='https://images.local/a'; s.tables.productos[1].imagen_url='https://images.local/a';
  const result=await s.load(images).DELETE(s.request('restaurantId=branch-A',{imageId:11}),params(1));
  assert.equal(result.status,200); assert.equal(result.body.storageCleanup,'deferred'); assert.equal(s.tables.productos[0].imagen_url,null); assert.equal(s.tables.productos[1].imagen_url,'https://images.local/a'); assert.equal(s.tables.producto_imagenes.length,1); assert.equal(s.objects.length,0);
});
test('partial cleanup failures keep object and existing image metadata', async () => {
  for(const table of ['productos','producto_imagenes']) { const s=setup(); s.failures[table]=true;
    assert.equal((await s.load(images).DELETE(s.request('restaurantId=branch-A',{imageId:11}),params(1))).status,500); assert.equal(s.tables.producto_imagenes.length,2); assert.equal(s.objects.length,0);
  }
});
test('existing image read and cover selection remain available', async () => {
  const s=setup(),route=s.load(images); assert.equal((await route.GET(s.request(),params(1))).body[0].id,11);
  assert.equal((await route.PUT(s.request('restaurantId=branch-A',{imageId:11}),params(1))).status,200); assert.equal(s.tables.productos[0].imagen_url,'https://images.local/a');
});
test('design: no browser Storage client or credentials; public write policy removal draft', () => {
  for(const file of ['app/admin/productos/page.tsx','app/admin/marcas/page.tsx']) assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/supabaseClient|service_role|SUPABASE_SERVICE_ROLE_KEY|\.storage\.from/);
  const sql=fs.readFileSync(path.join(root,'qa/b7/b743b_storage_DRAFT.sql'),'utf8');
  for(const op of ['insert','update','delete']) assert.ok(sql.includes('DROP POLICY IF EXISTS productos_public_'+op));
  assert.doesNotMatch(sql,/DROP POLICY.*productos_public_read/);
});

test('real local multipart parsing is bounded without trusting Content-Length', async () => {
  const s=setup(), helper=s.load('lib/adminImageStorage.ts');
  const form=new FormData(); form.append('file',new Blob([png],{type:'image/png'}),'x.html');
  const response=new Response(form);
  const image=await helper.readAdminImage({body:response.body,headers:response.headers}); assert.equal(image.ext,'png');
  const tooBig=new Response(Buffer.alloc(5*1024*1024+65537));
  await assert.rejects(()=>helper.readAdminImage({body:tooBig.body,headers:new Headers()}),/grande/);
});
test('JPEG and WebP signatures determine assigned extension, not browser filename', async () => {
  for(const [bytes,mime,ext] of [[Buffer.from([255,216,255,224,0,0,0,0,0,0,0,0]),'image/jpeg','jpg'],[Buffer.from('RIFF0000WEBPVP8 '),'image/webp','webp']]) {
    const s=setup(); assert.equal((await s.load(images).POST(upload(s,bytes,mime),params(1))).status,201); assert.ok(s.objects[0].path.endsWith('.'+ext));
  }
});
