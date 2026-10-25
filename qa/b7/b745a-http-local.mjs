// Real loopback HTTP; real handlers/auth/parsers; in-memory DB/Storage, NOT RLS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { test, after } from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const next = require('next/server');
const root = path.resolve(import.meta.dirname, '../..');
let requestCount = 0;
after(() => console.log(`B745A loopback HTTP requests: ${requestCount}`));

// Reuse the reviewed B743 fixture, without importing/running its direct-call tests.
// Fail closed on fixture drift. No dotenv, Supabase SDK, DNS or network imports
// are available to application modules. The VM is an import boundary, not a
// security sandbox against hostile repository source.
const source = fs.readFileSync(path.join(root, 'qa/b7/b743b-storage-local.mjs'), 'utf8');
assert.ok(source.includes('function setup() {') && source.includes('\nconst images ='));
let fixture = source.slice(source.indexOf('function setup() {'), source.indexOf('\nconst images ='));
fixture = fixture.replace(/const next = \{ NextResponse:[^\n]+\n/, '');
fixture = fixture.replace('module: mod, exports: mod.exports, Buffer, Response,', 'module: mod, exports: mod.exports, Buffer, Response, Headers, FormData, Blob, ReadableStream, Uint8Array,');
fixture = fixture.replace("if (name.startsWith('@/')) return load(name.slice(2) + '.ts');", "if (name.startsWith('@/')) return load(name.slice(2) + '.ts');\n        if (name.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name)) + '.ts');");
const setup = vm.runInNewContext(`(${fixture.trim()})`, {
  assert, fs: { readFileSync(file, encoding) {
    const resolved = path.resolve(file);
    assert.ok(resolved.startsWith(root + path.sep) && resolved.endsWith('.ts'));
    return fs.readFileSync(resolved, encoding);
  } }, vm, path, root, ts, next, Buffer, Response, Headers, FormData, Blob,
  ReadableStream, Uint8Array,
  require(name) { assert.equal(name, 'node:crypto'); return require(name); },
});

const routes = [
  ['/api/public/contexto', 'public/contexto'], ['/api/public/mesa', 'public/mesa'],
  ['/api/productos', 'productos'], ['/api/admin/productos', 'admin/productos'],
  ['/api/admin/productos/1/imagenes', 'admin/productos/[id]/imagenes', '1'],
  ['/api/admin/productos/2/imagenes', 'admin/productos/[id]/imagenes', '2'],
  ['/api/admin/marcas/brand-A/logo', 'admin/marcas/[id]/logo', 'brand-A'],
  ['/api/admin/marcas/brand-B/logo', 'admin/marcas/[id]/logo', 'brand-B'],
  ['/api/pedidos', 'pedidos'], ['/api/admin/pedidos-operacion', 'admin/pedidos-operacion'],
  ['/api/admin/cobros', 'admin/cobros'], ['/api/public/cobros', 'public/cobros'],
];
async function serverFor(run) {
  const s = setup();
  Object.assign(s.tables, { pedidos: [], items_pedido: [], order_collections: [], order_collection_configs: [], order_collection_events: [] });
  s.tables.productos[0].nombre = 'Producto A'; s.tables.productos[0].precio = 10;
  s.tables.producto_restaurantes[0].visible_en_menu = true;
  const loaded = new Map(routes.map(([url, file, id]) => [url, { handlers: s.load(`app/api/${file}/route.ts`), id }]));
  let sockets = 0;
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://127.0.0.1:${server.address().port}`);
      const route = loaded.get(url.pathname);
      if (!route) { outgoing.writeHead(404).end(); return; }
      // Explicit adapter dispatch: 405/Allow/HEAD are adapter behavior, NOT
      // evidence of Next's router, middleware, proxy or runtime dispatch.
      const allowed = Object.keys(route.handlers).filter(k => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k));
      const handler = route.handlers[incoming.method === 'HEAD' ? 'GET' : incoming.method];
      if (!handler) { outgoing.writeHead(405, { Allow: allowed.join(', ') }).end(); return; }
      const request = new next.NextRequest(url, {
        method: incoming.method, headers: incoming.headers,
        ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
      });
      const response = await handler(request, { params: Promise.resolve({ id: route.id }) });
      assert.ok(response instanceof Response);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      // Do not silently turn unexpected loader/adapter errors into passing API tests.
      outgoing.writeHead(598, { 'content-type': 'application/json' });
      outgoing.end(JSON.stringify({ adapterError: String(error) }));
    }
  });
  server.on('connection', () => sockets++);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  async function request(url, { method = 'GET', auth = false, cookie, json, raw, headers = {} } = {}) {
    requestCount++;
    const payload = json !== undefined ? JSON.stringify(json) : raw;
    const response = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: url, method,
        headers: { ...(payload !== undefined ? { 'content-length': Buffer.byteLength(payload) } : {}), ...(auth ? { cookie: `restosmart_admin_session=${s.token}` } : {}), ...(cookie ? { cookie } : {}), ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, agent: false }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
      }); req.on('error', reject); req.end(payload);
    });
    assert.notEqual(response.status, 598, response.text);
    assert.doesNotMatch(response.text, /local-test-only|injected|service_role|SUPABASE_|stack|private|secret/);
    return { ...response, body: response.text ? JSON.parse(response.text) : null };
  }
  try { await run(s, request); assert.ok(sockets > 0); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const branch = '?restaurantId=branch-A';
const images = '/api/admin/productos/1/imagenes';
const logo = '/api/admin/marcas/brand-A/logo';
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
async function multipart(bytes = png, mime = 'image/png', extra) {
  const form = new FormData(); form.append('file', new Blob([bytes], { type: mime }), '../../evil.svg');
  if (extra) form.append('storage_path', extra);
  const encoded = new Response(form);
  return { raw: Buffer.from(await encoded.arrayBuffer()), headers: Object.fromEntries(encoded.headers) };
}

test('HTTP public context/mesa: minimal projection, explicit branch, no writes', () => serverFor(async (s, req) => {
  assert.equal((await req('/api/public/contexto' + branch)).body.config.nombre_local, 'A');
  const mesa = await req('/api/public/mesa' + branch + '&numero=1');
  assert.deepEqual(Object.keys(mesa.body).sort(), ['id','nombre','numero','restaurant_id']);
  for (const [url, status] of [['/api/public/contexto',404], ['/api/public/contexto?restaurantId=closed',404], ['/api/public/mesa'+branch+'&numero=0',400], ['/api/public/mesa'+branch+'&numero=2',404]]) assert.equal((await req(url)).status,status);
  assert.ok(s.calls.every(c => !c.write));
}));

for (const url of ['/api/admin/productos', images, logo, '/api/pedidos', '/api/admin/pedidos-operacion', '/api/admin/cobros']) {
  test(`HTTP auth and tenant boundaries ${url}`, () => serverFor(async (s, req) => {
    const method = url === logo ? 'POST' : 'GET';
    for (const options of [{}, { cookie: 'restosmart_admin_session=tampered' }, { cookie: `restosmart_admin_session=${s.token}x` }]) assert.equal((await req(url + branch, {method,...options})).status,401);
    assert.equal((await req(url+'?restaurantId=branch-B',{method,auth:true})).status,403);
    const foreign = s.auth.createAdminSessionToken({adminId:'admin-A',email:'a@test.local',tenantId:'tenant-B'});
    assert.equal((await req(url+branch,{method,cookie:`restosmart_admin_session=${foreign}`})).status,403);
    assert.ok(s.calls.every(c => !c.write)); assert.equal(s.objects.length,0);
  }));
}

test('HTTP products: public scoped read, private admin read, anonymous POST denied', () => serverFor(async (s,req) => {
  const pub=await req('/api/productos'+branch); assert.equal(pub.status,200); assert.equal(pub.body[0].id,1); assert.equal(pub.body.length,1);
  assert.equal((await req('/api/productos')).status,400);
  const admin=await req('/api/admin/productos'+branch,{auth:true}); assert.equal(admin.status,200); assert.equal(admin.body[0].id,1);
  assert.equal((await req('/api/productos'+branch,{method:'POST',json:{nombre:'Attack'}})).status,401);
  assert.ok(s.calls.every(c=>!c.write));
}));

test('HTTP multipart product and logo: real parser, safe assigned paths and metadata', () => serverFor(async(s,req)=>{
  for(const url of [images,logo]) assert.equal((await req(url+branch,{method:'POST',auth:true,...await multipart()})).status,201);
  assert.equal(s.objects.length,2);
  for(const object of s.objects) { assert.match(object.path,/^tenants\/[a-f0-9]{64}\/(productos|marcas)\/[a-f0-9]{64}\/[a-f0-9-]+\.png$/); assert.equal(object.options.upsert,false); assert.equal(object.options.contentType,'image/png'); }
  assert.match(s.tables.marcas[0].logo_url,/tenants/); assert.equal(s.tables.marcas[1].logo_url,undefined);
}));

test('HTTP multipart malformed, missing, MIME mismatch, oversize and client path rejected',()=>serverFor(async(s,req)=>{
  const cases=[{raw:'broken',headers:{'content-type':'multipart/form-data; boundary=bad'}}, {json:{}}, await multipart(Buffer.alloc(0)),await multipart(Buffer.from('<html>')),await multipart(png,'image/jpeg'),await multipart(Buffer.alloc(5*1024*1024+1)),await multipart(png,'image/png','2/foreign.jpg')];
  for(const url of [images,logo]) for(const body of cases) assert.equal((await req(url+branch,{method:'POST',auth:true,...body})).status,body.json ? 409 : 400);
  assert.equal(s.objects.length,0); assert.ok(s.calls.every(c=>!c.write));
}));

test('HTTP foreign product/brand rejected before upload',()=>serverFor(async(s,req)=>{
  for(const url of ['/api/admin/productos/2/imagenes','/api/admin/marcas/brand-B/logo']) assert.equal((await req(url+branch,{method:'POST',auth:true,...await multipart()})).status,404);
  assert.equal(s.objects.length,0); assert.ok(s.calls.every(c=>!c.write));
}));

test('HTTP cover PUT and DELETE constrained to owned image; deferred physical cleanup',()=>serverFor(async(s,req)=>{
  assert.equal((await req(images+branch,{auth:true})).body[0].id,11);
  assert.equal((await req(images+branch,{method:'PUT',auth:true,json:{imageId:22}})).status,404);
  assert.equal((await req(images+branch,{method:'PUT',auth:true,json:{imageId:11}})).status,200);
  assert.equal(s.tables.productos[0].imagen_url,'https://images.local/a'); assert.equal(s.tables.productos[1].imagen_url,undefined);
  assert.equal((await req(images+branch,{method:'DELETE',auth:true,json:{imageId:22}})).status,404);
  const result=await req(images+branch,{method:'DELETE',auth:true,json:{imageId:11}}); assert.equal(result.status,200); assert.equal(result.body.storageCleanup,'deferred'); assert.equal(s.tables.productos[0].imagen_url,null);
}));

test('HTTP storage failure returns generic error without metadata write',()=>serverFor(async(s,req)=>{
  s.failures.upload=true; assert.equal((await req(images+branch,{method:'POST',auth:true,...await multipart()})).status,500); assert.equal(s.tables.producto_imagenes.length,2);
}));

test('HTTP kitchen and collections read; malformed JSON, origin, foreign order and public confirmation rejected',()=>serverFor(async(s,req)=>{
  for(const url of ['/api/admin/pedidos-operacion','/api/admin/cobros']) {
    const read=await req(url+branch,{auth:true}); assert.equal(read.status,200); assert.equal(read.headers['cache-control'],'private, no-store');
    assert.equal((await req(url+branch,{method:'POST',auth:true,json:{},headers:{origin:'https://foreign.invalid'}})).status,403);
  }
  assert.equal((await req('/api/admin/cobros'+branch,{method:'POST',auth:true,raw:'{',headers:{'content-type':'application/json'}})).status,400);
  assert.equal((await req('/api/admin/pedidos-operacion'+branch,{method:'POST',auth:true,json:{pedidoId:999,action:'cocina',estado:'listo'}})).status,409);
  assert.equal((await req('/api/public/cobros',{method:'POST',json:{action:'confirm',orderId:1}})).status,400);
  assert.equal((await req('/api/public/cobros',{method:'POST',json:{token:'00000000-0000-0000-0000-000000000000'}})).status,404);
  assert.equal((await req('/api/pedidos',{method:'POST',json:{}})).status,400);
  assert.ok(s.calls.every(c=>!c.write));
}));

test('HTTP unsupported verbs across routes: adapter 405/Allow and no mutations',()=>serverFor(async(s,req)=>{
  for(const [url] of routes) for(const method of ['GET','POST','PUT','PATCH','DELETE']) {
    const route=routes.find(r=>r[0]===url); const handlers=s.load(`app/api/${route[1]}/route.ts`);
    if(handlers[method]) continue;
    const response=await req(url+branch,{method,json:{}}); assert.equal(response.status,405); assert.ok(response.headers.allow);
  }
  assert.ok(s.calls.every(c=>!c.write));
}));

test('HTTP kitchen state mutation uses owned order/items and blocks unpaid preparation',()=>serverFor(async(s,req)=>{
  s.tables.pedidos.push({id:1,restaurant_id:'branch-A',estado:'pendiente'}, {id:2,restaurant_id:'branch-B',estado:'pendiente'});
  s.tables.items_pedido.push({id:10,pedido_id:1,comentarios:'[[COCINA:pendiente]] sin sal'}, {id:20,pedido_id:2,comentarios:'[[COCINA:pendiente]] ajeno'});
  const url='/api/admin/pedidos-operacion'+branch;
  s.tables.order_collections.push({order_id:1,restaurant_id:'branch-A',require_payment:true,state:'pending'});
  const options={method:'POST',auth:true,json:{pedidoId:1,action:'cocina',estado:'en_preparacion'}};
  assert.equal((await req(url,options)).status,409); assert.ok(s.calls.every(c=>!c.write));
  s.tables.order_collections[0].state='confirmed';
  assert.equal((await req(url,options)).status,200);
  assert.equal(s.tables.items_pedido[0].comentarios,'[[COCINA:en_preparacion]] sin sal');
  assert.equal(s.tables.items_pedido[1].comentarios,'[[COCINA:pendiente]] ajeno');
  assert.equal(s.tables.pedidos[0].estado,'en_preparacion'); assert.equal(s.tables.pedidos[1].estado,'pendiente');
}));

test('HTTP public collection config exposes only effective config, never events/accounts',()=>serverFor(async(s,req)=>{
  s.tables.restaurants.push({id:1,owner_tenant_id:'tenant-A',estado:'activo',private:'secret'});
  const response=await req('/api/public/cobros?restaurantId=1'); assert.equal(response.status,200);
  assert.deepEqual(response.body,{config:null}); assert.equal(response.headers['cache-control'],'no-store'); assert.equal(response.headers['referrer-policy'],'no-referrer');
  assert.ok(s.calls.every(c=>!c.write));
}));

test('HTTP anonymous writes on protected image/kitchen/collection handlers are denied',()=>serverFor(async(s,req)=>{
  for(const [url,methods] of [[images,['POST','PUT','DELETE']],[logo,['POST']],['/api/admin/pedidos-operacion',['POST']],['/api/admin/cobros',['POST']]])
    for(const method of methods) for(const cookie of [undefined,'restosmart_admin_session=altered']) assert.equal((await req(url+branch,{method,cookie,json:{imageId:11}})).status,401);
  assert.equal(s.objects.length,0); assert.equal(s.calls.length,0);
}));
