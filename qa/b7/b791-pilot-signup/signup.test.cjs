const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const source = fs.readFileSync('app/api/signup/route.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load() {
  let accesses = 0;
  const exports = {};
  new Function('require', 'exports', js)((name) => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options.status }) } };
    if (name === '@/lib/adminAuth') return {};
    if (name === '@/lib/supabaseAdmin') return { supabaseAdmin: { from() { accesses++; throw new Error('DB_REACHED'); } } };
    if (name === '@/lib/plans') return { normalizeBusinessMode: x => x, normalizePlan: x => x };
    throw new Error(name);
  }, exports);
  return { post: body => exports.POST({ json: async () => body }), count: () => accesses };
}
for (const code of [undefined, null, '', 'WRONG', 'CLUBSMART-PILOTO-2026', {}, ['RESTOSMART-PILOTO-2026']]) {
  test(`reject invalid code ${JSON.stringify(code)} before touching DB`, async () => {
    const route = load();
    const response = await route.post({ pilot_code: code });
    assert.equal(response.status, 403);
    assert.equal(route.count(), 0);
  });
}
test('correct code permits normal signup validation', async () => {
  const route = load();
  const response = await route.post({ pilot_code: ' RESTOSMART-PILOTO-2026 ' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /nombre del negocio/);
  assert.equal(route.count(), 0);
});
