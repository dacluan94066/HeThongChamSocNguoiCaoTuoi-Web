const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const body = () => ({ hoTen: 'NCT kiểm thử', ngaySinh: '1950-01-01', gioiTinh: 'Nữ' });
function fixture(options = {}) {
  const statements = [], transactions = [];
  class Transaction {
    constructor() { transactions.push(this); }
    async begin(level) { this.level = level; }
    async commit() { this.committed = true; }
    async rollback() { this.rolledBack = true; }
  }
  class Request {
    constructor() { this.values = {}; }
    input(name, _type, value) { this.values[name] = value; return this; }
    async query(statement) {
      statements.push({ statement, values: { ...this.values } });
      if (statement.includes('FROM NguoiDung nd WITH')) return { recordset: options.account === null ? []
        : [options.account || { role: 'NguoiCaoTuoi', status: 'HoatDong', email: 'test@example.invalid', phone: '0899999930' }] };
      if (statement.includes('WHERE UserID=@userId') && statement.includes('FROM HoSoNguoiCaoTuoi WITH')) {
        return { recordset: options.existing ? [options.existing] : [] };
      }
      if (statement.includes("SELECT 'PHONE_TAKEN'")) return { recordset: options.duplicate ? [{ reason: options.duplicate }] : [] };
      if (statement.includes('INSERT INTO HoSoNguoiCaoTuoi')) {
        if (options.failInsert) throw Object.assign(new Error('TEST INSERT FAILURE'), { number: options.sqlNumber });
        return { recordset: [{ id: 42 }] };
      }
      if (options.failSync) throw new Error('TEST SYNC FAILURE');
      return { rowsAffected: [1] };
    }
  }
  const filename = path.resolve(__dirname, '../src/controllers/mobileOnboarding.controller.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: name => name === '../config/db' ? { poolPromise: Promise.resolve({}),
      sql: { Transaction, Request, Int: 'Int', Date: 'Date', VarChar: () => 'VarChar', NVarChar: () => 'NVarChar',
        ISOLATION_LEVEL: { SERIALIZABLE: 4 } } }
      : name === '../utils/response' ? {
        ok: (res, data, message, status = 200) => Object.assign(res, { status, data, message }),
        fail: (res, message, errorCode, status) => Object.assign(res, { status, message, errorCode }),
      } : createRequire(filename)(name),
  }, { filename });
  async function run(input = body(), role = 'NguoiCaoTuoi') {
    const res = {}; let error;
    await module.exports.createMine({ user: { userId: 31, tenVaiTro: role }, body: input }, res, e => { error = e; });
    return { res, error };
  }
  return { run, statements, transactions };
}

test('Mobile completion creates only the JWT-owned profile and syncs account name/phone atomically, never credentials/assignment', async () => {
  const f = fixture(); const { res, error } = await f.run();
  assert.equal(error, undefined); assert.equal(res.status, 201); assert.equal(res.data.id, 42); assert.equal(res.data.userId, 31);
  const insert = f.statements.find(x => x.statement.includes('INSERT INTO HoSoNguoiCaoTuoi'));
  assert.equal(insert.values.userId, 31); assert.equal(insert.values.phone, '0899999930');
  assert.equal(f.transactions[0].level, 4); assert.equal(f.transactions[0].committed, true);
  assert.equal(f.statements.some(x => x.statement.includes('UPDATE NguoiDung SET HoTen=@hoTen,SoDienThoai=@phone')), true);
  assert.doesNotMatch(f.statements.map(x => x.statement).join('\n'), /INSERT INTO NguoiDung|SET MatKhauHash|INSERT INTO NguoiCaoTuoi_NguoiChamSoc/);
});

test('Mobile completion rejects Admin/caregiver and client-supplied identity/role/status/credentials', async () => {
  for (const role of ['QuanTriVien', 'NguoiChamSoc', '']) {
    const f = fixture(); const { res } = await f.run(body(), role);
    assert.equal(res.status, 403); assert.equal(f.statements.length, 0);
  }
  for (const field of ['userId', 'UserID', 'id', 'nguoiChamSocId', 'trangThai', 'vaiTro', 'taiKhoan', 'email']) {
    const f = fixture(); const { res } = await f.run({ ...body(), [field]: 1 });
    assert.equal(res.status, 422); assert.equal(f.statements.length, 0);
  }
});

test('Mobile completion shares required/date/gender/phone/CCCD/column-length validation', async () => {
  for (const input of [null, [], {}, { ...body(), hoTen: '' }, { ...body(), ngaySinh: '9999-01-01' },
    { ...body(), ngaySinh: '1950-02-30' }, { ...body(), gioiTinh: 'Male' },
    { ...body(), soDienThoai: '1901234567' }, { ...body(), cccd: '123' }, { ...body(), diaChi: 'a'.repeat(256) }]) {
    const f = fixture(); const { res } = await f.run(input);
    assert.equal(res.status, 422); assert.equal(f.statements.length, 0);
  }
});

test('Repeated completion returns existing profile without overwriting edits or creating a second profile', async () => {
  const f = fixture({ existing: { id: 42, userId: 31, hoTen: 'Existing profile' } });
  const { res } = await f.run();
  assert.equal(res.status, 200); assert.equal(res.data.hoTen, 'Existing profile');
  assert.equal(f.transactions[0].committed, true); assert.equal(f.statements.length, 2);
});

test('Completion rechecks account role/status inside the transaction', async () => {
  for (const account of [null, { role: 'QuanTriVien', status: 'HoatDong' }, { role: 'NguoiCaoTuoi', status: 'KhoaTaiKhoan' }]) {
    const f = fixture({ account }); const { res } = await f.run();
    assert.equal(res.status, 401); assert.equal(f.transactions[0].rolledBack, true); assert.equal(f.statements.length, 1);
  }
});

test('Conflicting existing phone/CCCD is refused, never automatically linked by identifier', async () => {
  for (const duplicate of ['PHONE_TAKEN', 'CCCD_TAKEN']) {
    const f = fixture({ duplicate }); const { res } = await f.run();
    assert.equal(res.status, 409); assert.equal(res.errorCode, duplicate);
    assert.equal(f.transactions[0].rolledBack, true);
    assert.equal(f.statements.some(x => /INSERT|UPDATE/.test(x.statement.replace(/UPDLOCK/g, ''))), false);
  }
});

test('Insert/account-sync SQL failure rolls back both writes; unique conflict returns 409', async () => {
  for (const options of [{ failInsert: true }, { failSync: true }, { failInsert: true, sqlNumber: 2601 }]) {
    const f = fixture(options); const { res, error } = await f.run();
    assert.equal(f.transactions[0].rolledBack, true); assert.notEqual(f.transactions[0].committed, true);
    if (options.sqlNumber) assert.equal(res.status, 409);
    else { assert.ok(error); assert.equal(res.status, undefined); }
  }
});

test('POST /elderly/me preserves auth, existing self-edit permission and scope without granting generic creation', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/hoSoNguoiCaoTuoi.routes.js'), 'utf8');
  assert.match(source, /router\.use\(authMiddleware\)/); assert.match(source, /router\.use\(scope.loadMobileScope\)/);
  assert.match(source, /router.post\('\/me', checkPermission\('QLHOSONCT','sua'\), mobileOnboarding.createMine\)/);
  assert.match(source, /router.post\(\s*'\/',\s*scope.webOnlyWrite,\s*checkPermission\('QLHOSONCT', 'them'\)/);
});
