const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const bcrypt = require('bcryptjs');

function fixture(options = {}) {
  const statements = [], transactions = [];
  class Transaction {
    constructor() { transactions.push(this); }
    async begin(level) { this.level = level; }
    async commit() { this.committed = true; }
    async rollback() { this.rolledBack = true; }
  }
  class Request {
    constructor(transaction) { this.transaction = transaction; this.values = {}; }
    input(name, _type, value) { this.values[name] = value; return this; }
    async query(statement) {
      statements.push({ statement, values: this.values, transaction: this.transaction });
      if (statement.includes('FROM HoSoNguoiCaoTuoi')) return { recordset: options.linked === null ? []
        : [options.linked || { id: 7, userId: 31, role: 'NguoiCaoTuoi' }] };
      if (options.failUpdate) throw new Error('TEST SQL FAILURE');
      return { rowsAffected: [options.noRows ? 0 : 1] };
    }
  }
  const response = {
    ok: (res, data, message, status = 200) => Object.assign(res, { status, data, message }),
    fail: (res, message, errorCode, status) => Object.assign(res, { status, message, errorCode }),
  };
  const filename = path.resolve(__dirname, '../src/controllers/hoSoNguoiCaoTuoi.controller.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: name => name === '../config/db' ? { poolPromise: Promise.resolve({}),
      sql: { Transaction, Request, Int: 'Int', VarChar: () => 'VarChar', ISOLATION_LEVEL: { SERIALIZABLE: 4 } } }
      : name === '../utils/response' ? response
        : name === '../middlewares/mobile-scope.middleware' ? { scopedWhere: () => '' }
          : createRequire(filename)(name),
  }, { filename });
  async function run({ role = 'QuanTriVien', id = '7', body = { matKhauMoi: 'New-Test-Password-123' } } = {}) {
    const res = {}; let error;
    await module.exports.resetMobilePassword({ user: { tenVaiTro: role }, params: { id }, body }, res, e => { error = e; });
    return { res, error };
  }
  return { run, statements, transactions };
}

test('Only Admin can reset an NCT password, even when a caregiver has profile-edit permission', async () => {
  for (const role of ['NguoiChamSoc', 'NguoiCaoTuoi', 'BacSi', '']) {
    const f = fixture(); const { res, error } = await f.run({ role });
    assert.equal(error, undefined); assert.equal(res.status, 403);
    assert.equal(f.statements.length, 0); assert.equal(f.transactions.length, 0);
  }
});

test('Invalid IDs, empty/weak/oversized passwords and injected user/role fields fail before SQL', async () => {
  for (const id of ['0', '-1', '1e2', '1.5', 'abc', '2147483648']) {
    const f = fixture(); const { res } = await f.run({ id });
    assert.equal(res.errorCode, 'INVALID_ID'); assert.equal(res.status, 422);
    assert.equal(f.statements.length, 0);
  }
  for (const body of [null, [], {}, { matKhauMoi: '12345' }, { matKhauMoi: '      ' },
    { matKhauMoi: 'a'.repeat(73) }, { matKhauMoi: 'ắ'.repeat(25) },
    { matKhauMoi: 'valid-test', userId: 1 }, { matKhauMoi: 'valid-test', vaiTroId: 1 }]) {
    const f = fixture(); const { res } = await f.run({ body });
    assert.equal(res.status, 422); assert.equal(f.statements.length, 0);
    assert.equal(f.transactions.length, 0);
  }
});

test('Reset targets only the linked elderly user, hashes the password and invalidates old OTP without changing role/status/profile', async () => {
  const f = fixture(); const { res, error } = await f.run();
  assert.equal(error, undefined); assert.equal(res.status, 200);
  assert.equal(res.data.id, 7); assert.equal(res.data.userId, 31);
  assert.equal(f.transactions.length, 1); assert.equal(f.transactions[0].level, 4);
  assert.equal(f.transactions[0].committed, true);
  const read = f.statements[0], write = f.statements[1];
  assert.equal(read.values.id, 7); assert.equal(write.values.userId, 31);
  assert.equal(await bcrypt.compare('New-Test-Password-123', write.values.hash), true);
  assert.match(write.statement, /MaOTP=NULL,MaOTPHetHan=NULL/);
  assert.match(write.statement, /SoLanGuiOTP=0/);
  assert.match(write.statement, /vt\.TenVaiTro=N'NguoiCaoTuoi'/);
  assert.doesNotMatch(write.statement, /(?:SET|,)\s*(?:TrangThai|UserID|VaiTroID|HoTen|Email|SoDienThoai)\s*=/);
  assert.equal(write.transaction, read.transaction);
  assert.doesNotMatch(JSON.stringify(res), /New-Test-Password|MatKhauHash|\$2[aby]\$/);
});

for (const [linked, code, status] of [[null, 'NOT_FOUND', 404],
  [{ id: 7, userId: null, role: null }, 'ACCOUNT_NOT_FOUND', 409],
  [{ id: 7, userId: 1, role: 'QuanTriVien' }, 'ACCOUNT_ROLE_MISMATCH', 409],
  [{ id: 7, userId: 2, role: 'NguoiChamSoc' }, 'ACCOUNT_ROLE_MISMATCH', 409]]) {
  test(`Missing or wrong-role account is never created, relinked or reset: ${code} ${linked?.role}`, async () => {
    const f = fixture({ linked }); const { res, error } = await f.run();
    assert.equal(error, undefined); assert.equal(res.status, status); assert.equal(res.errorCode, code);
    assert.equal(f.transactions[0].rolledBack, true); assert.equal(f.statements.length, 1);
  });
}

test('A failed or zero-row password UPDATE rolls back and never returns a false success', async () => {
  for (const options of [{ failUpdate: true }, { noRows: true }]) {
    const f = fixture(options); const { res, error } = await f.run();
    assert.ok(error); assert.equal(res.status, undefined);
    assert.equal(f.transactions[0].rolledBack, true); assert.notEqual(f.transactions[0].committed, true);
  }
});

test('Reset endpoint preserves authentication, Web write and QLHOSONCT/sua permission middleware', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/hoSoNguoiCaoTuoi.routes.js'), 'utf8');
  assert.match(source, /router\.use\(authMiddleware\)/);
  assert.match(source, /router\.post\(\s*'\/:id\/reset-password',\s*scope\.webOnlyWrite,\s*checkPermission\('QLHOSONCT', 'sua'\),\s*controller\.resetMobilePassword/);
});
