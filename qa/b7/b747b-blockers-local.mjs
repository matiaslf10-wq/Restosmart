// Real handlers and signed sessions; in-memory DB fixtures, no SQL/network/RLS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const require = createRequire(import.meta.url), ts = require('typescript');
const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, 'qa/b7/b743b-storage-local.mjs'), 'utf8');
const fixture = source.slice(source.indexOf('function setup() {'), source.indexOf('\nconst images ='));
const setup = vm.runInNewContext(`(${fixture.trim()})`, { assert, fs, vm, path, root, ts, Buffer, Response, Headers, URL, require });
const stats = 'app/api/stats/route.ts', menu = 'app/api/admin/menu/route.ts', orders = 'app/api/admin/pedidos-operacion/route.ts';
function seeded() {
  const s = setup();
  s.tables.admin_users.push({id:'admin-B',email:'b@test.local',tenant_id:'tenant-B',activo:true});
  s.tables.productos.push({id:3, categoria:'A2', disponible:true});
  s.tables.producto_restaurantes.push({producto_id:3,restaurant_id:'branch-A2'});
  s.tables.mesas.push({id:11,numero:2,restaurant_id:'branch-A'}, {id:20,numero:1,restaurant_id:'branch-A2'}, {id:30,numero:1,restaurant_id:'branch-B'});
  s.tables.pedidos = [[101,10,'branch-A'],[102,11,'branch-A'],[201,20,'branch-A2'],[301,30,'branch-B']].map(([id,mesa_id,restaurant_id])=>({id,mesa_id,restaurant_id,estado:'pendiente',creado_en:'2026-01-01'}));
  s.tables.order_collections=[];
  return s;
}
function asB(s, request) {
  const token=s.auth.createAdminSessionToken({adminId:'admin-B',email:'b@test.local',tenantId:'tenant-B'});
  request.cookies={get:()=>({value:token}),getAll:()=>[]}; return request;
}
test('stats: missing/tampered cookie and inactive admin rejected before resource reads', async()=>{
  for(const mode of ['none','tampered','inactive','unknown-active']) {
    const s=seeded(), req=s.request('restaurantId=branch-A',{},mode!=='none');
    if(mode==='tampered') req.cookies={get:()=>({value:s.token+'x'}),getAll:()=>[]};
    if(mode==='inactive') s.tables.admin_users[0].activo=false;
    if(mode==='unknown-active') s.tables.admin_users[0].activo=null;
    assert.equal((await s.load(stats).GET(req)).status,['inactive','unknown-active'].includes(mode)?403:401);
    assert.ok(s.calls.every(c=>!c.write && !['productos','producto_restaurantes'].includes(c.table)));
  }
});
test('stats: authorized A/A2/B slices and foreign branch denied', async()=>{
  for(const [branch,id,b] of [['branch-A',1,false],['branch-A2',3,false],['branch-B',2,true]]) {
    const s=seeded(), req=s.request('restaurantId='+branch);
    const result=await s.load(stats).GET(b?asB(s,req):req);
    assert.equal(result.status,200); assert.deepEqual(Array.from(result.body,x=>x.id),[id]);
  }
  const s=seeded(); assert.equal((await s.load(stats).GET(s.request('restaurantId=branch-B'))).status,403);
  assert.ok(s.calls.every(c=>!c.write && c.table!=='productos'));
});
test('legacy menu: every method authenticates, authorizes and blocks before any menu read/write', async()=>{
  for(const method of ['GET','POST','PUT','PATCH','DELETE']) for(const [branch,auth,status] of [['branch-A',false,401],['branch-B',true,403],['branch-A',true,409]]) {
    const s=seeded(), before=JSON.stringify(s.tables);
    assert.equal((await s.load(menu)[method](s.request('restaurantId='+branch,{id:2,categoria_id:999},auth))).status,status);
    assert.equal(JSON.stringify(s.tables),before); assert.ok(s.calls.every(c=>!c.write && !['menu_items','categorias','productos'].includes(c.table)));
  }
});
test('orders: mesa_id numeric projection and QR number resolves per branch; mozo grouping stays isolated', async()=>{
  for(const [branch,numero,ids,mesa] of [['branch-A',1,[101],10],['branch-A',2,[102],11],['branch-A2',1,[201],20]]) {
    const s=seeded(), r=await s.load(orders).GET(s.request(`restaurantId=${branch}&mesaNumero=${numero}`));
    assert.equal(r.status,200); assert.deepEqual(Array.from(r.body.pedidos,p=>p.id),ids);
    assert.ok(r.body.pedidos.every(p=>typeof p.mesa_id==='number' && p.mesa_id===mesa && p.restaurant_id===branch));
  }
  const s=seeded(), r=await s.load(orders).GET(s.request());
  assert.deepEqual(Array.from(r.body.pedidos,p=>p.mesa_id),[10,11]);
  const b=await s.load(orders).GET(asB(s,s.request('restaurantId=branch-B&mesaNumero=1')));
  assert.deepEqual(Array.from(b.body.pedidos,p=>p.mesa_id),[30]);
});
test('orders: anonymous, foreign branch, invalid/missing table and foreign mutation leave data intact', async()=>{
  for(const [query,auth,status] of [['restaurantId=branch-A',false,401],['restaurantId=branch-B',true,403],['restaurantId=branch-A&mesaNumero=10',true,404],['restaurantId=branch-A&mesaNumero=NaN',true,400]]) {
    const s=seeded(),before=JSON.stringify(s.tables);
    assert.equal((await s.load(orders).GET(s.request(query,{},auth))).status,status);
    assert.equal(JSON.stringify(s.tables),before); assert.ok(s.calls.every(c=>!c.write));
  }
  const s=seeded(),before=JSON.stringify(s.tables);
  assert.equal((await s.load(orders).POST(s.request('restaurantId=branch-A',{action:'cerrar',pedidoIds:[101,201]}))).status,409);
  assert.equal(JSON.stringify(s.tables),before); assert.ok(s.calls.every(c=>!c.write));
});
test('browser contract: legacy SQL removed, account uses scoped number; mozo resolves number to real id',()=>{
  const read=file=>fs.readFileSync(path.join(root,file),'utf8');
  assert.doesNotMatch(read('app/admin/menu/page.tsx'),/supabaseClient|service_role|\.from\(/);
  assert.match(read('app/admin/menu/page.tsx'),/api\/admin\/menu/);
  assert.match(read('app/mesa/[mesaId]/cuenta/page.tsx'),/loadOperationalOrders\(restaurantId, mesaId\)/);
  assert.doesNotMatch(read('app/mesa/[mesaId]/cuenta/page.tsx'),/pedido\.mesa_id === mesaId/);
  assert.match(read('app/mozo/mesas/[mesaId]/page.tsx'),/pedido\.mesa_id === mesa.id/);
  assert.match(read('app/mozo/mesas/page.tsx'),/pedidosPorMesa\[pedido.mesa_id\]/);
});
