const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { alertTimestampSql } = require('../src/utils/alertTime');

function fixture(row) {
  const queries = [], parameters = {};
  const request = () => ({
    input(name, _, value) { parameters[name] = value; return this; },
    async query(statement) {
      queries.push(statement);
      // The real SQL conversion is also exercised against the isolated Stage6 DB.
      assert.ok(statement.includes(`${alertTimestampSql('nct.NgayTao')} AS ngayTao`));
      assert.equal((statement.match(/AT TIME ZONE 'SE Asia Standard Time'/g) || []).length, 1);
      assert.doesNotMatch(statement, /\b(?:UPDATE|INSERT|DELETE)\b/i);
      return { recordset: [row] };
    },
  });
  const filename = path.resolve(__dirname, '../src/controllers/hoSoNguoiCaoTuoi.controller.js');
  const module = { exports: {} }, nativeRequire = createRequire(filename);
  const stubs = {
    '../config/db': { poolPromise: Promise.resolve({ request }), sql: { Int: 'Int', NVarChar: 'String' } },
    '../middlewares/mobile-scope.middleware': { scopedWhere: () => ' AND nct.NguoiCaoTuoiID IN (7)' },
    '../services/elderlyCreation.service': {},
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: name => stubs[name] || nativeRequire(name) }, { filename });
  const response = { status() { return this; }, json(body) { this.body = body; return this; } };
  return { controller: module.exports, queries, parameters, response };
}

async function invoke(f, handler) {
  await f.controller[handler]({ query: {}, params: { id: '7' }, user: { userId: 42 } },
    f.response, error => { throw error; });
  const result = f.response.body.data;
  return handler === 'getAll' ? result[0] : result;
}

for (const handler of ['getAll', 'getById', 'getMe']) {
  for (const [wall, utc] of [
    ['2026-10-27T13:05:00', '2026-10-27T06:05:00Z'],
    ['2026-10-27T23:55:00', '2026-10-27T16:55:00Z'],
  ]) test(`${handler}: SQL Vietnam ${wall} is projected once as ${utc}`, async () => {
    const row = { id: 7, ngayTao: utc, ngaySinh: '1950-01-01', hoTen: 'Fixture NCT' };
    const f = fixture(row), result = await invoke(f, handler);
    assert.equal(result.ngayTao, utc); // No second conversion of the already-zoned SQL result.
    assert.equal(result.ngaySinh, row.ngaySinh);
    assert.equal(result.hoTen, row.hoTen);
    if (handler === 'getMe') assert.equal(f.parameters.userId, 42);
    if (handler === 'getById') assert.equal(f.parameters.id, '7');
    if (handler === 'getAll') assert.match(f.queries[0], /AND nct.NguoiCaoTuoiID IN \(7\)/);
  });
}

test('already-correct UTC timestamps pass through unchanged, including fractional seconds', async () => {
  const row = { id: 7, ngayTao: '2026-10-27T06:05:00.123Z',
    consentAt: '2026-10-27T13:05:00.456Z' };
  for (const handler of ['getAll', 'getById', 'getMe']) {
    const result = await invoke(fixture(row), handler);
    assert.equal(result.ngayTao, row.ngayTao);
    assert.equal(result.consentAt, row.consentAt);
  }
});

test('profile conversion is restricted to NgayTao and preserves the date-only birth contract', async () => {
  const f = fixture({ id: 7, ngayTao: '2026-10-27T06:05:00Z', ngaySinh: '1950-01-01' });
  await invoke(f, 'getAll');
  assert.match(f.queries[0], /nct\.NgaySinh\s+AS ngaySinh/);
  assert.match(f.queries[0], /ORDER BY nct\.NgayTao DESC/);
  assert.doesNotMatch(f.queries[0], /DATEADD\([^)]*nct\.NgayTao/i);
});
