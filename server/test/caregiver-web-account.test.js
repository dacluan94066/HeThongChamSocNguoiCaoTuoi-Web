const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const bcrypt = require('bcryptjs');

function load(relative, stubs) {
  const filename = path.resolve(__dirname, relative);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports,
    require: (name) => stubs[name] ?? createRequire(filename)(name),
    process: { env: { JWT_SECRET: 'test-only-secret', JWT_EXPIRES_IN: '5m' } },
    console,
  }, { filename });
  return module.exports;
}

test('Admin creates caregiver profile account; caregiver logs in on Web and sees assigned elderly', async () => {
  const state = {
    caregiver: { id: 7, userId: null, name: 'Người chăm sóc thử',
      email: 'caregiver@example.invalid', phone: '0900000001' },
    elderly: { id: 11, hoTen: 'Người cao tuổi được phân công' },
    committed: 0,
  };
  class Transaction {
    async begin() {}
    async commit() { state.committed += 1; }
    async rollback() { state.rolledBack = true; }
  }
  class Request {
    constructor() { this.values = {}; }
    input(name, _type, value) { this.values[name] = value; return this; }
    async query(statement) {
      if (statement.includes('FROM NguoiChamSoc WITH(UPDLOCK,HOLDLOCK)')) {
        return { recordset: [{ ...state.caregiver }] };
      }
      if (statement.includes('FROM NguoiDung WITH(UPDLOCK,HOLDLOCK)')) return { recordset: [] };
      if (statement.includes("FROM VaiTro WHERE TenVaiTro=N'NguoiChamSoc'")) return { recordset: [{ id: 2 }] };
      if (statement.includes('INSERT INTO NguoiDung(')) {
        state.user = { UserID: 31, TenDangNhap: this.values.username,
          MatKhauHash: this.values.hash, HoTen: this.values.name,
          Email: this.values.email, SoDienThoai: this.values.phone,
          TrangThai: 'HoatDong', VaiTroID: 2, TenVaiTro: 'NguoiChamSoc' };
        return { recordset: [{ id: 31 }] };
      }
      if (statement.includes('UPDATE NguoiChamSoc SET UserID=')) {
        state.caregiver.userId = this.values.userId;
        return { recordset: [{ id: state.caregiver.id }] };
      }
      if (statement.includes('FROM NguoiChamSoc ncs WITH(UPDLOCK,HOLDLOCK)')) {
        return { recordset: [{ userId: state.caregiver.userId }] };
      }
      if (statement.includes('UPDATE NguoiDung SET MatKhauHash=')) {
        state.user.MatKhauHash = this.values.hash;
        return { recordset: [] };
      }
      if (statement.includes('FROM NguoiDung nd') && statement.includes('WHERE nd.TenDangNhap')) {
        return { recordset: state.user?.TenDangNhap === this.values.tenDangNhap ? [state.user] : [] };
      }
      if (statement.includes('FROM NguoiChamSoc ncs JOIN NguoiCaoTuoi_NguoiChamSoc')) {
        return { recordset: state.caregiver.userId === this.values.userId ? [state.elderly] : [] };
      }
      if (statement.includes('UPDATE NguoiDung SET LanDangNhapCuoi')
        || statement.includes('INSERT INTO NhatKyDangNhap')) return { recordset: [] };
      throw new Error(`Unexpected query: ${statement.slice(0, 100)}`);
    }
  }
  const pool = { request: () => new Request() };
  const sql = { Int: 'Int', VarChar: () => 'VarChar', NVarChar: () => 'NVarChar',
    ISOLATION_LEVEL: { SERIALIZABLE: 'SERIALIZABLE' }, Transaction, Request };
  const db = { poolPromise: Promise.resolve(pool), sql };
  const response = { ok: (res, data, _message, status = 200) => {
    res.status = status; res.data = data; return data;
  }, fail: (res, message, code, status) => { res.status = status; res.error = code; res.message = message; } };
  const account = load('../src/controllers/caregiverAccount.controller.js', {
    '../config/db': db, '../utils/response': response,
  });
  const auth = load('../src/controllers/auth.controller.js', {
    '../config/db': db, '../utils/response': response,
    '../config/mailer': { sendMail: async () => {} },
    '../services/googleAuth.service': { GoogleIdentityError: Error, verifyGoogleIdToken: async () => {} },
  });
  const assistant = load('../src/controllers/careAssistant.controller.js', {
    '../config/db': db, '../utils/response': response,
    '../middlewares/mobile-scope.middleware': { loadMobileScope: async () => {} },
  });
  const created = {};
  await account.createWebAccount({ params: { id: 7 }, user: { tenVaiTro: 'QuanTriVien' },
    body: { tenDangNhap: 'caregiver.test', matKhauTam: 'temporary-123' } },
  created, (error) => { throw error; });
  assert.equal(created.status, 201);
  assert.equal(state.caregiver.userId, 31);
  assert.equal(state.committed, 1);
  assert.equal(await bcrypt.compare('temporary-123', state.user.MatKhauHash), true);

  const loggedIn = {};
  await auth.login({ body: { tenDangNhap: 'caregiver.test', matKhau: 'temporary-123', platform: 'web' },
    ip: '127.0.0.1' }, loggedIn, (error) => { throw error; });
  assert.equal(loggedIn.status, 200);
  assert.equal(loggedIn.data.user.tenVaiTro, 'NguoiChamSoc');
  assert.ok(loggedIn.data.token);

  const assigned = {};
  await assistant.assignedProfiles({ user: { userId: 31, tenVaiTro: 'NguoiChamSoc' } }, assigned);
  assert.equal(assigned.status, 200);
  assert.deepEqual(Array.from(assigned.data, (row) => row.id), [11]);

  const reset = {};
  await account.resetWebPassword({ params: { id: 7 }, user: { tenVaiTro: 'QuanTriVien' },
    body: { matKhauTam: 'replacement-123' } }, reset, (error) => { throw error; });
  assert.equal(reset.status, 200);
  assert.equal(await bcrypt.compare('replacement-123', state.user.MatKhauHash), true);
});

test('Mobile elderly registration reports duplicate email and phone clearly', async () => {
  for (const duplicate of ['email', 'phone']) {
    const pool = { request: () => ({
      input() { return this; },
      async query(statement) {
        if (statement.includes('WHERE TenDangNhap = @tenDangNhap')) return { recordset: [] };
        if (statement.includes('WHERE Email = @email')) {
          return { recordset: duplicate === 'email' ? [{ UserID: 1 }] : [] };
        }
        if (statement.includes('SELECT 1 AS used')) {
          return { recordset: duplicate === 'phone' ? [{ used: 1 }] : [] };
        }
        throw new Error(`Unexpected query: ${statement.slice(0, 80)}`);
      },
    }) };
    const auth = load('../src/controllers/auth.controller.js', {
      '../config/db': { poolPromise: Promise.resolve(pool), sql: { NVarChar: 'NVarChar', VarChar: () => 'VarChar' } },
      '../utils/response': { ok: () => {}, fail: (res, message, code, status) => {
        res.status = status; res.message = message; res.error = code;
      } },
      '../config/mailer': { sendMail: async () => {} },
      '../services/googleAuth.service': { GoogleIdentityError: Error, verifyGoogleIdToken: async () => {} },
    });
    const result = {};
    await auth.register({ body: { tenDangNhap: 'elder.test', matKhau: 'password123',
      hoTen: 'Người cao tuổi', ngaySinh: '1950-01-01', gioiTinh: 'Nam',
      email: 'elder@example.invalid', soDienThoai: '0900000002' } }, result,
    (error) => { throw error; });
    assert.equal(result.status, 409);
    assert.equal(result.message, duplicate === 'email'
      ? 'Email đã được sử dụng' : 'Số điện thoại đã được sử dụng');
  }
});
