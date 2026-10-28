const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function fixture(controller, conflict = 'PHONE_TAKEN') {
  const writes = [], transactions = [];
  class Transaction {
    constructor() { transactions.push(this); }
    async begin() {}
    async commit() { this.committed = true; }
    async rollback() { this.rolledBack = true; }
  }
  class Request {
    input() { return this; }
    async query(q) {
      if (q.includes('AS identityConflict')) return { recordset: conflict ? [{ identityConflict: conflict }] : [] };
      if (/UPDATE NguoiDung|UPDATE\s+NguoiDung/.test(q)) writes.push(q);
      if (q.includes('SELECT nd.UserID, vt.TenVaiTro')) return { recordset: [{ UserID: 7, TenVaiTro: 'NguoiCaoTuoi' }] };
      return { recordset: [], rowsAffected: [1] };
    }
  }
  const sql = { Transaction, Request, Int: 'Int', VarChar: () => 'VarChar', NVarChar: () => 'NVarChar' };
  const filename = path.resolve(__dirname, `../src/controllers/${controller}.controller.js`);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, Buffer,
    require: name => name === '../config/db' ? { poolPromise: Promise.resolve({ request: () => new Request() }), sql }
      : name === '../utils/response' ? { ok: (res, data, message, status = 200) => Object.assign(res, { status, data, message }),
        fail: (res, message, errorCode, status) => Object.assign(res, { status, message, errorCode }) }
      : createRequire(filename)(name),
  }, { filename });
  return { handler: module.exports[controller === 'auth' ? 'updateMe' : 'update'], writes, transactions };
}

for (const controller of ['auth', 'nguoiDung']) {
  test(`${controller}: duplicate account phone is 409 before any account write`, async () => {
    const f = fixture(controller), res = {}; let error;
    await f.handler({ user: { userId: 7, tenVaiTro: 'NguoiCaoTuoi' }, params: { id: '7' },
      body: { hoTen: 'Tên tài khoản thử', email: 'fixture.7@example.invalid', soDienThoai: '0899999922' } }, res, e => { error = e; });
    assert.equal(error, undefined);
    assert.equal(res.status, 409); assert.equal(res.errorCode, 'PHONE_TAKEN');
    assert.equal(f.writes.length, 0); assert.equal(f.transactions[0].rolledBack, true);
  });
}
