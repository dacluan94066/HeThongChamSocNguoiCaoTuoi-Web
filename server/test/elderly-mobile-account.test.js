const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const bcrypt = require('bcryptjs');
const { validateElderlyAccount } = require('../src/utils/elderlyAccountValidation');

const account = () => ({ tenDangNhap: 'mobile.demo', email: 'demo@example.invalid', matKhau: 'TestOnly-123' });
const profile = () => ({ hoTen: 'NCT kiểm thử', ngaySinh: '1950-01-01', gioiTinh: 'Nam', soDienThoai: '0899999911' });
function fixture(options = {}) {
  const statements = [], transactions = [];
  class Transaction {
    constructor() { transactions.push(this); this.committed = false; this.rolledBack = false; }
    async begin(level) { this.level = level; }
    async commit() { this.committed = true; }
    async rollback() { this.rolledBack = true; }
  }
  class Request {
    constructor(transaction) { this.transaction = transaction; this.values = {}; }
    input(name, _type, value) { this.values[name] = value; return this; }
    async query(statement) {
      statements.push({ statement, values: { ...this.values }, transaction: this.transaction });
      let rows = [];
      if (statement.includes('FROM NguoiDung WITH')) rows = options.duplicate ? [{ reason: options.duplicate }] : [];
      if (statement.includes("SELECT 'EMAIL_TAKEN' AS reason")) rows = options.reserved ? [{ reason: options.reserved }] : [];
      if (statement.includes('FROM VaiTro')) rows = options.noRole ? [] : [{ id: 3 }];
      if (statement.includes('INSERT INTO NguoiDung')) rows = [{ userId: 31 }];
      if (statement.includes('INSERT INTO HoSoNguoiCaoTuoi')) {
        if (options.failProfile) throw Object.assign(new Error(options.sqlMessage || 'test failure'), { number: options.sqlNumber });
        rows = [{ id: 42 }];
      }
      return { recordset: rows };
    }
  }
  const pool = { request: () => new Request() };
  const sql = { Transaction, Request, Int: 'Int', Date: 'Date',
    VarChar: () => 'VarChar', NVarChar: () => 'NVarChar', ISOLATION_LEVEL: { SERIALIZABLE: 'SERIALIZABLE' } };
  const response = {
    ok: (res, data, message, status = 200) => Object.assign(res, { status, data, message }),
    fail: (res, message, errorCode, status) => Object.assign(res, { status, message, errorCode }),
  };
  const filename = path.resolve(__dirname, options.userManagement
    ? '../src/controllers/nguoiDung.controller.js' : '../src/controllers/hoSoNguoiCaoTuoi.controller.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: name => name === '../config/db' ? { poolPromise: Promise.resolve(pool), sql }
      : name === '../utils/response' ? response
        : name === '../middlewares/mobile-scope.middleware' ? { scopedWhere: () => '' }
          : createRequire(filename)(name), console,
  }, { filename });
  async function create(body = { ...profile(), taiKhoan: account() }) {
    const res = {}; let error;
    await module.exports.create({ body, user: { userId: 1, tenVaiTro: 'QuanTriVien' } }, res, e => { error = e; });
    return { res, error };
  }
  return { create, statements, transactions };
}

test('Mobile account fields have bounded input, normalized email and reject role/user-ID injection', () => {
  const normalized = validateElderlyAccount({ ...account(), email: ' DEMO@Example.Invalid ', tenDangNhap: ' mobile.demo ' });
  assert.equal(normalized.value.email, 'demo@example.invalid');
  assert.equal(normalized.value.tenDangNhap, 'mobile.demo');
  for (const input of [null, false, [], { ...account(), vaiTroId: 1 }, { ...account(), userId: 1 }]) {
    assert.equal(validateElderlyAccount(input).error.code, 'INVALID_ACCOUNT_INPUT');
  }
  for (const [change, code] of [
    [{ tenDangNhap: 'x' }, 'INVALID_USERNAME'], [{ tenDangNhap: 'u'.repeat(51) }, 'INVALID_USERNAME'],
    [{ tenDangNhap: 'user@example.com' }, 'INVALID_USERNAME'],
    [{ email: '' }, 'INVALID_EMAIL'], [{ email: 'bad-email' }, 'INVALID_EMAIL'],
    [{ email: `${'a'.repeat(95)}@x.com` }, 'INVALID_EMAIL'],
    [{ matKhau: '12345' }, 'INVALID_PASSWORD'], [{ matKhau: '      ' }, 'INVALID_PASSWORD'],
    [{ matKhau: 'a'.repeat(73) }, 'INVALID_PASSWORD'], [{ matKhau: 'ắ'.repeat(25) }, 'INVALID_PASSWORD'],
  ]) assert.equal(validateElderlyAccount({ ...account(), ...change }).error.code, code);
  assert.ok(validateElderlyAccount({ ...account(), matKhau: 'a'.repeat(72) }).value);
});

test('Invalid credentials return 422 before touching SQL, with field-specific Vietnamese messages', async () => {
  for (const taiKhoan of [null, {}, { ...account(), matKhau: '123' }, { ...account(), email: '' }]) {
    const f = fixture(); const { res, error } = await f.create({ ...profile(), taiKhoan });
    assert.equal(error, undefined); assert.equal(res.status, 422);
    assert.equal(f.statements.length, 0); assert.equal(f.transactions.length, 0);
    assert.equal(typeof res.message, 'string');
  }
});

test('Creating a linked Mobile account hashes the password and commits both records in one transaction', async () => {
  const f = fixture();
  const { res, error } = await f.create({ ...profile(), UserID: 999, vaiTroId: 1,
    taiKhoan: { ...account(), email: ' DEMO@Example.Invalid ' } });
  assert.equal(error, undefined); assert.equal(res.status, 201);
  assert.equal(res.data.id, 42); assert.equal(res.data.userId, 31);
  assert.equal(res.data.coTaiKhoanMobile, true); assert.equal(res.data.tenDangNhap, 'mobile.demo');
  assert.equal(f.transactions.length, 1); const transaction = f.transactions[0];
  assert.equal(transaction.level, 'SERIALIZABLE'); assert.equal(transaction.committed, true);
  const user = f.statements.find(item => item.statement.includes('INSERT INTO NguoiDung'));
  const elder = f.statements.find(item => item.statement.includes('INSERT INTO HoSoNguoiCaoTuoi'));
  assert.equal(user.values.roleId, 3); assert.equal(user.values.email, 'demo@example.invalid');
  assert.equal(eldersLink(elder), 31);
  assert.equal(user.transaction, transaction); assert.equal(elder.transaction, transaction);
  assert.notEqual(user.values.hash, account().matKhau);
  assert.equal(await bcrypt.compare(account().matKhau, user.values.hash), true);
  assert.doesNotMatch(JSON.stringify(res), /TestOnly-123|\$2[aby]\$/);
  assert.ok(f.statements.some(item => item.statement.includes("TenVaiTro=N'NguoiCaoTuoi'")));
});
function eldersLink(statement) { return statement.values.userId; }

for (const duplicate of ['USERNAME_TAKEN', 'EMAIL_TAKEN', 'PHONE_TAKEN']) {
  test(`Duplicate ${duplicate} returns 409 and never writes an account or profile`, async () => {
    const f = fixture({ duplicate }); const { res, error } = await f.create();
    assert.equal(error, undefined); assert.equal(res.status, 409); assert.equal(res.errorCode, duplicate);
    assert.equal(f.transactions[0].rolledBack, true);
    assert.equal(f.statements.some(item => /INSERT INTO/.test(item.statement)), false);
  });
}

for (const reserved of ['EMAIL_TAKEN', 'PHONE_TAKEN']) {
  test(`Unlinked caregiver/elderly contact reservation ${reserved} cannot be stolen by a new Mobile account`, async () => {
    const f = fixture({ reserved }); const { res } = await f.create();
    assert.equal(res.status, 409); assert.equal(res.errorCode, reserved);
    assert.equal(f.transactions[0].rolledBack, true);
    assert.equal(f.statements.some(item => /INSERT INTO/.test(item.statement)), false);
  });
}

test('Failure creating the elderly profile rolls back the already-created user; missing role also rolls back', async () => {
  const f = fixture({ failProfile: true }); const { res, error } = await f.create();
  assert.ok(error); assert.equal(res.status, undefined);
  assert.equal(f.transactions[0].rolledBack, true); assert.equal(f.transactions[0].committed, false);
  const absent = fixture({ noRole: true }); const failure = await absent.create();
  assert.equal(failure.res.errorCode, 'ROLE_NOT_FOUND'); assert.equal(absent.transactions[0].rolledBack, true);
});

test('Concurrent unique-key conflict is a safe 409 after rollback, never a partial success', async () => {
  const f = fixture({ failProfile: true, sqlNumber: 2601 }); const { res, error } = await f.create();
  assert.equal(error, undefined); assert.equal(res.status, 409);
  assert.equal(res.errorCode, 'DUPLICATE_ACCOUNT'); assert.equal(f.transactions[0].rolledBack, true);
});

test('Existing profile-only creation remains compatible and does not create a login account', async () => {
  const f = fixture(); const { res, error } = await f.create(profile());
  assert.equal(error, undefined); assert.equal(res.status, 201);
  assert.equal(res.data.coTaiKhoanMobile, false); assert.equal(res.data.userId, null);
  assert.equal(f.transactions.length, 0);
  assert.equal(f.statements.length, 1);
  assert.match(f.statements[0].statement, /INSERT INTO HoSoNguoiCaoTuoi/);
  assert.equal(f.statements[0].values.userId, null);
});

test('Create route still requires Web access and existing QLHOSONCT/them permission', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/hoSoNguoiCaoTuoi.routes.js'), 'utf8');
  assert.match(source, /router\.post\(\s*'\/',\s*scope\.webOnlyWrite,\s*checkPermission\('QLHOSONCT', 'them'\),\s*controller\.create/);
});

const userBody = () => ({ ...profile(), username: account().tenDangNhap,
  password: account().matKhau, email: account().email, vaiTro: 'NGUOI_CAO_TUOI' });

test('User management creates a full elderly profile and returns user ID plus linked elderly ID atomically', async () => {
  const f = fixture({ userManagement: true });
  const { res, error } = await f.create({ ...userBody(), UserID: 999, vaiTroId: 1,
    taiKhoan: { tenDangNhap: 'injected-admin', email: 'attack@example.invalid', matKhau: 'injected' } });
  assert.equal(error, undefined); assert.equal(res.status, 201);
  assert.equal(res.data.id, 31); assert.equal(res.data.userId, 31); assert.equal(res.data.nguoiCaoTuoiId, 42);
  assert.equal(f.transactions.length, 1); assert.equal(f.transactions[0].committed, true);
  const user = f.statements.find(item => item.statement.includes('INSERT INTO NguoiDung'));
  assert.equal(user.values.username, account().tenDangNhap); assert.equal(user.values.roleId, 3);
  assert.equal(user.values.email, account().email);
  assert.doesNotMatch(JSON.stringify(res), /TestOnly-123|\$2[aby]\$/);
});

test('Bare or invalid elderly user creation is rejected before SQL rather than leaving an account without a profile', async () => {
  for (const change of [{ ngaySinh: undefined }, { gioiTinh: undefined }, { cccd: '123' },
    { soDienThoai: '123' }, { password: undefined }, { email: undefined }]) {
    const f = fixture({ userManagement: true });
    const { res, error } = await f.create({ ...userBody(), ...change });
    assert.equal(error, undefined); assert.equal(res.status, 422);
    assert.equal(f.statements.length, 0); assert.equal(f.transactions.length, 0);
  }
});

test('User-management duplicate and SQL failure follow the same rollback guarantees as elderly creation', async () => {
  for (const duplicate of ['USERNAME_TAKEN', 'EMAIL_TAKEN', 'PHONE_TAKEN']) {
    const f = fixture({ userManagement: true, duplicate }); const { res } = await f.create(userBody());
    assert.equal(res.status, 409); assert.equal(res.errorCode, duplicate);
    assert.equal(f.transactions[0].rolledBack, true);
    assert.equal(f.statements.some(item => item.statement.includes('INSERT INTO')), false);
  }
  const f = fixture({ userManagement: true, failProfile: true }); const { res, error } = await f.create(userBody());
  assert.ok(error); assert.equal(res.status, undefined); assert.equal(f.transactions[0].rolledBack, true);
});

test('A duplicate CCCD rolls back the new account and highlights CCCD instead of an unrelated login field', async () => {
  const f = fixture({ userManagement: true, failProfile: true, sqlNumber: 2601, sqlMessage: 'Duplicate UX_HoSoNCT_CCCD' });
  const { res, error } = await f.create(userBody());
  assert.equal(error, undefined); assert.equal(res.status, 409); assert.equal(res.errorCode, 'CCCD_TAKEN');
  assert.equal(f.transactions[0].rolledBack, true); assert.notEqual(f.transactions[0].committed, true);
});

test('Profile creation UI is moved to user management and shared personal/health fields are reused', () => {
  const root = path.resolve(__dirname, '../../frontend/src');
  const elderlyPage = fs.readFileSync(path.join(root, 'pages/ElderlyProfiles/ElderlyProfilesPage.jsx'), 'utf8');
  const usersPage = fs.readFileSync(path.join(root, 'pages/Users/UsersPage.jsx'), 'utf8');
  assert.doesNotMatch(elderlyPage, /handleAdd|createElder\(|>Thêm hồ sơ(?: mới)?</);
  for (const page of [elderlyPage, usersPage]) {
    assert.match(page, /<ElderlyPersonalFields/); assert.match(page, /<ElderlyHealthFields/);
  }
  assert.match(usersPage, /selectedRole === 'NGUOI_CAO_TUOI'/);
  assert.match(usersPage, /createUser\(buildUserCreatePayload\(values\)\)/);
  assert.match(elderlyPage, /resetElderMobilePassword/); assert.match(elderlyPage, /assignElderCaregiver/);
});

test('Frontend payload uses the full NCT form only for the selected role, excluding confirmations and hidden state', async () => {
  const { pathToFileURL } = require('node:url');
  const { buildUserCreatePayload, mobilePasswordRules } = await import(pathToFileURL(
    path.resolve(__dirname, '../../frontend/src/utils/accountFormRules.js')).href);
  const values = { ...userBody(), ngaySinh: { format: format => { assert.equal(format, 'YYYY-MM-DD'); return '1950-01-01'; } },
    benhNen: 'A, B, ', diUng: 'C, ', xacNhanMatKhau: 'PRIVATE_CONFIRMATION', userId: 999, trangThai: 'KHOA',
    taiKhoan: { userId: 999 }, cccd: '012345678901', email: ' DEMO@Example.Invalid ' };
  const body = buildUserCreatePayload(values);
  assert.equal(body.ngaySinh, '1950-01-01'); assert.equal(body.email, account().email);
  assert.deepEqual(body.benhNen, ['A', 'B']); assert.deepEqual(body.diUng, ['C']);
  assert.equal(body.cccd, values.cccd); assert.equal(body.password, account().matKhau);
  for (const field of ['xacNhanMatKhau', 'userId', 'trangThai', 'taiKhoan']) assert.equal(body[field], undefined);
  const switched = buildUserCreatePayload({ ...values, vaiTro: 'NGUOI_CHAM_SOC' });
  for (const field of ['ngaySinh', 'gioiTinh', 'cccd', 'diaChi', 'nhomMau', 'benhNen', 'diUng', 'xacNhanMatKhau']) {
    assert.equal(switched[field], undefined);
  }
  const passwordValidator = mobilePasswordRules.find(rule => rule.validator).validator;
  await assert.rejects(passwordValidator(null, 'ắ'.repeat(25)));
  await passwordValidator(null, 'valid-password');
});
