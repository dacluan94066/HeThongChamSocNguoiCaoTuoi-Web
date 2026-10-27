const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const jwt = require('jsonwebtoken');

function fixture() {
  const calls = [];
  const pool = { request: () => {
    const values = {};
    return { input(key, _type, value) { values[key] = value; return this; }, async query(statement) {
      calls.push({ statement, values: { ...values } });
      if (statement.includes('JOIN VaiTro')) return { recordset: [{ VaiTroID: 3, TrangThai: 'HoatDong', TenVaiTro: 'NguoiCaoTuoi' }] };
      if (statement.includes('WHERE UserID = @userId')) return { recordset: [{ id: 42 }] };
      if (statement.includes('AS elderlyId')) return { recordset: [{ elderlyId: values.id === 42 ? 42 : 99 }] };
      throw new Error('Unexpected fixture query');
    } };
  } };
  const load = file => {
    const filename = path.resolve(__dirname, '../src', file), module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, console,
      process: { env: { JWT_SECRET: 'web-scope-fixture-only' } },
      require: name => name === '../config/db' ? { poolPromise: Promise.resolve(pool), sql: { Int: 'Int' } }
        : name === '../utils/response' ? { fail: (res, message, errorCode, status) => Object.assign(res, { message, errorCode, status }) }
          : createRequire(filename)(name),
    }, { filename });
    return module.exports;
  };
  return { auth: load('middlewares/auth.middleware.js'), scope: load('middlewares/mobile-scope.middleware.js'), calls };
}
const claims = { userId: 70, vaiTroId: 3, tenVaiTro: 'NguoiCaoTuoi', sessionVersion: 2 };
test('NCT Web JWT keeps existing owner scope; URL/query/body IDs do not grant another profile', async () => {
  const f = fixture(), token = jwt.sign(claims, 'web-scope-fixture-only', { expiresIn: '5m' });
  const req = { headers: { authorization: `Bearer ${token}` }, body: { userId: 99, nguoiCaoTuoiId: 99 }, query: { nguoiCaoTuoiId: 99 }, params: { id: '99' } };
  let passed = 0; await f.auth(req, {}, () => passed++); await f.scope.loadMobileScope(req, {}, () => passed++);
  assert.equal(passed, 2); assert.deepEqual(Array.from(req.mobileElderlyIds), [42]);
  assert.equal(f.scope.targetElderlyId(req, 99), null); assert.equal(f.scope.targetElderlyId(req, 42), 42);
  assert.match(f.scope.scopedWhere(req, 'nct.NguoiCaoTuoiID'), /IN \(42\)/);
  const denied = {}; await f.scope.guardResource('HoSoNguoiCaoTuoi', 'NguoiCaoTuoiID')(req, denied, () => assert.fail('Foreign profile must be denied'));
  assert.equal(denied.status, 403); assert.equal(denied.errorCode, 'FORBIDDEN_ELDERLY');
  req.params.id = '42'; await f.scope.guardResource('HoSoNguoiCaoTuoi', 'NguoiCaoTuoiID')(req, {}, () => passed++);
  assert.equal(passed, 3);
  const write = {}; f.scope.webOnlyWrite(req, write, () => assert.fail('Web login must not grant staff writes')); assert.equal(write.status, 403);
});
test('expired and tampered Web JWTs are rejected before querying account data', async () => {
  const f = fixture();
  for (const token of [jwt.sign(claims, 'web-scope-fixture-only', { expiresIn: -1 }), jwt.sign(claims, 'wrong-fixture-key')]) {
    const res = {}; await f.auth({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail('Token must fail'));
    assert.equal(res.status, 401);
  }
  assert.equal(f.calls.length, 0);
});
