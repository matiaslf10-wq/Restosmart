const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const js = ts.transpileModule(fs.readFileSync('app/api/public/cobros/route.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function route(state) {
 const calls=[]; const exports={};
 const db={ from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: state === null ? null : { order_id:111,tenant_id:'test',restaurant_id:19,state },error:null }; } }; }, async rpc(name,args) { calls.push(args); return { error:null }; } };
 new Function('require','exports',js)(name => name === 'next/server' ? { NextResponse:{json:(body,options={})=>({body,status:options.status||200})} } : name === '@/lib/supabaseAdmin' ? {supabaseAdmin:db} : {},exports);
 return { calls, post:token=>exports.POST({ headers:{get:()=>null}, nextUrl:{origin:'https://example.test'}, json:async()=>({token}) }) };
}
const token='12345678-1234-1234-1234-123456789abc';
for(const state of ['declared','confirmed']) test(`repeated declaration is successful when ${state}`,async()=>{ const r=route(state); const out=await r.post(token);assert.equal(out.status,200);assert.equal(out.body.state,state);assert.equal(r.calls.length,0); });
test('pending declaration uses server-derived order and scope',async()=>{ const r=route('pending');assert.equal((await r.post(token)).status,200);assert.equal(r.calls[0].p_order,111);assert.equal(r.calls[0].p_action,'declare'); });
test('unknown capability is rejected',async()=>{ const r=route(null);assert.equal((await r.post(token)).status,404);assert.equal(r.calls.length,0); });
test('malformed capability is rejected',async()=>{ const r=route('pending');assert.equal((await r.post('bad')).status,400);assert.equal(r.calls.length,0); });
