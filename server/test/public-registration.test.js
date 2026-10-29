const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const { createRelativeRegistration } = require('../src/services/relativeRegistration.service');

const body = extra => ({ tenDangNhap: 'fixture.relative', matKhau: 'Fixture-123', hoTen: 'Người thân fixture', email: 'relative@example.invalid', soDienThoai: '0000000001', ...extra });
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function load(relative, stubs) {
  const filename = path.resolve(__dirname, relative), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: name => stubs[name] ?? createRequire(filename)(name), console,
    process: { env: { JWT_SECRET: 'registration-fixture-secret', JWT_EXPIRES_IN: '5m' } },
  }, { filename });
  return module.exports;
}
function fixture(options = {}) {
  const state = { users: [], profiles: [], caregivers: [], statements: [], commits: 0, rollbacks: 0 };
  const roleNames = { 12: 'NguoiChamSoc', 13: 'NguoiCaoTuoi', 14: 'NguoiThan' };
  class Transaction {
    constructor() { this.users = []; this.profiles = []; this.caregivers = []; }
    async begin(level) { this.level = level; }
    async commit() {
      if (options.failCommit) throw Error('FIXTURE_COMMIT_FAILED');
      state.users.push(...this.users); state.profiles.push(...this.profiles); state.caregivers.push(...this.caregivers); state.commits++;
    }
    async rollback() { this.users = []; this.profiles = []; this.caregivers = []; state.rollbacks++; }
  }
  class Request {
    constructor(transaction) { this.transaction = transaction; this.values = {}; }
    input(name, _type, value) { this.values[name] = value; return this; }
    async query(statement) {
      const v = this.values; state.statements.push(statement);
      if (statement.includes('sp_getapplock')) { if (options.busy) throw Object.assign(Error('BUSY'), { number: 51015 }); return { recordset: [] }; }
      if (statement.includes('AS identityConflict')) return { recordset: options.identityConflict ? [{ identityConflict: options.identityConflict }] : [] };
      if (statement.includes('FROM NguoiDung nd')) return { recordset: state.users.filter(user => [user.TenDangNhap, user.Email, user.SoDienThoai].includes(v.tenDangNhap)) };
      if (statement.includes('FROM NguoiDung') && !statement.includes('INSERT')) {
        if (options.duplicateEmail && statement.includes('Email')) return { recordset: [{ UserID: 999 }] };
        return { recordset: [] };
      }
      if (statement.includes('SELECT 1 AS used')) return { recordset: [] };
      if (statement.includes('FROM NguoiChamSoc')) return { recordset: [] };
      if (statement.includes('FROM VaiTro')) {
        if (options.missingRole) return { recordset: [] };
        const name = v.tenVaiTro || (statement.includes("N'NguoiThan'") ? 'NguoiThan' : 'NguoiChamSoc');
        const id = Number(Object.keys(roleNames).find(key => roleNames[key] === name));
        return { recordset: [{ VaiTroID: id, id }] };
      }
      if (statement.includes('INSERT INTO NguoiDung')) {
        if (options.failInsert) throw Object.assign(Error('FIXTURE_INSERT_FAILED'), { number: options.sqlNumber });
        const id = 351 + state.users.length;
        const roleId = v.roleId ?? v.vaiTroId;
        this.transaction.users.push({ UserID: id, TenDangNhap: v.username ?? v.tenDangNhap, MatKhauHash: v.hash ?? v.matKhauHash,
          HoTen: v.name ?? v.hoTen, Email: v.email, SoDienThoai: v.phone ?? v.soDienThoai ?? null,
          VaiTroID: roleId, TenVaiTro: roleNames[roleId], TrangThai: statement.includes("N'ChoDuyet'") ? 'ChoDuyet' : 'HoatDong' });
        return { recordset: [{ userId: id }] };
      }
      if (statement.includes('INSERT INTO HoSoNguoiCaoTuoi')) {
        this.transaction.profiles.push({ userId: v.userId, id: 801 }); return { recordset: [{ nguoiCaoTuoiId: 801 }] };
      }
      if (statement.includes('INSERT INTO NguoiChamSoc')) { this.transaction.caregivers.push({ userId: v.userId }); return { recordset: [] }; }
      if (statement.includes('UPDATE NguoiDung SET LanDangNhapCuoi') || statement.includes('INSERT INTO NhatKyDangNhap')) return { recordset: [] };
      throw Error('Unexpected SQL fixture statement: ' + statement.slice(0, 120));
    }
  }
  const pool = { request: () => new Request() }, sql = { Transaction, Request, ISOLATION_LEVEL: { SERIALIZABLE: 4 },
    Int: 'Int', Date: 'Date', VarChar: () => 'VarChar', NVarChar: () => 'NVarChar' };
  const db = { poolPromise: Promise.resolve(pool), sql };
  const relative = createRelativeRegistration(db);
  const auth = () => load('../src/controllers/auth.controller.js', { '../config/db': db, '../config/mailer': { sendMail: async () => { throw Error('NO_EXTERNAL_EMAIL'); } } });
  const run = async input => { const res = response(); let error; await relative({ body: input }, res, value => { error = value; }); return { res, error }; };
  return { state, run, auth };
}

test('public relative registration commits one account, hashes password, creates no elderly/link/consent data or JWT', async () => {
  const f = fixture(); const { res, error } = await f.run(body({ hoTen: ' Người thân fixture ', email: ' RELATIVE@example.invalid ' }));
  assert.equal(error, undefined); assert.equal(res.code, 201); assert.equal(res.body.data.loaiTaiKhoan, 'NguoiThan');
  assert.equal(f.state.users.length, 1); assert.equal(f.state.commits, 1); assert.equal(f.state.users[0].TrangThai, 'HoatDong');
  assert.equal(f.state.users[0].Email, 'relative@example.invalid');
  assert.equal(await bcrypt.compare('Fixture-123', f.state.users[0].MatKhauHash), true);
  assert.equal('token' in res.body.data, false); assert.equal(JSON.stringify(res.body).includes('MatKhauHash'), false);
  assert.equal(f.state.profiles.length + f.state.caregivers.length, 0);
  assert.doesNotMatch(f.state.statements.join('\n'), /INSERT INTO (HoSoNguoiCaoTuoi|NguoiChamSoc|NguoiCaoTuoi_NguoiThan|LichSu)|UPDATE /);
  assert.ok(f.state.statements.findIndex(statement => statement.includes('sp_getapplock')) < f.state.statements.findIndex(statement => statement.includes('INSERT INTO NguoiDung')));
});

test('optional relative phone remains NULL and never becomes a fabricated contact', async () => {
  const f = fixture(); const { res } = await f.run(body({ soDienThoai: '' })); assert.equal(res.code, 201); assert.equal(f.state.users[0].SoDienThoai, null);
});

for (const field of ['vaiTroId', 'tenVaiTro', 'loaiTaiKhoan', 'trangThai', 'userId', 'nguoiCaoTuoiId', 'phamViChiaSe', 'GoogleSubject']) {
  test(`public relative rejects privilege/link injection ${field} before SQL`, async () => {
    const f = fixture(); const { res } = await f.run(body({ [field]: field === 'tenVaiTro' ? 'QuanTriVien' : 1 }));
    assert.equal(res.code, 422); assert.equal(f.state.statements.length, 0);
  });
}
for (const [label, input] of [['empty name', { hoTen: ' ' }], ['long name', { hoTen: 'x'.repeat(101) }], ['bad username', { tenDangNhap: 'a' }],
  ['bad email', { email: 'wrong' }], ['bad phone', { soDienThoai: '123' }], ['weak password', { matKhau: '123' }], ['bcrypt truncation', { matKhau: 'é'.repeat(37) }]]) {
  test(`relative validation: ${label}`, async () => {
    const f = fixture(); const { res } = await f.run(body(input)); assert.equal(res.code, 422); assert.equal(f.state.statements.length, 0);
  });
}
for (const [option, code] of [[{ identityConflict: 'USERNAME_TAKEN' }, 'USERNAME_TAKEN'], [{ identityConflict: 'PHONE_TAKEN' }, 'PHONE_TAKEN'], [{ duplicateEmail: true }, 'EMAIL_TAKEN'], [{ busy: true }, 'ACCOUNT_IDENTITY_BUSY']]) {
  test(`relative duplicate/lock ${code} rolls back without an account`, async () => {
    const f = fixture(option); const { res } = await f.run(body()); assert.equal(res.code, 409); assert.equal(res.body.errorCode, code);
    assert.equal(f.state.users.length, 0); assert.equal(f.state.rollbacks, 1);
  });
}
test('relative role absent is unavailable; registration cannot install schema or manufacture roles', async () => {
  const f = fixture({ missingRole: true }); const { res } = await f.run(body()); assert.equal(res.code, 503);
  assert.equal(f.state.users.length, 0); assert.equal(f.state.rollbacks, 1);
});
test('SQL insert/commit failures roll back and never claim registration success', async () => {
  for (const options of [{ failInsert: true }, { failCommit: true }]) {
    const f = fixture(options); const { res, error } = await f.run(body()); assert.ok(error); assert.notEqual(res.code, 201);
    assert.equal(f.state.users.length, 0); assert.equal(f.state.rollbacks, 1);
  }
  const f = fixture({ failInsert: true, sqlNumber: 2627 }); const { res } = await f.run(body()); assert.equal(res.code, 409); assert.equal(f.state.users.length, 0);
});

test('actual public auth router: three registrations preserve NCT profile, caregiver approval and unlinked relative Web login (RAM SQL)', async t => {
  const f = fixture(), auth = f.auth();
  const pass = (_req, _res, next) => next();
  const router = load('../src/routes/auth.routes.js', { '../controllers/auth.controller': auth,
    '../middlewares/auth.middleware': pass,
    '../middlewares/permission.middleware': { checkPermission: () => pass, checkOwnPasswordPermission: pass } });
  const app = express(); app.use(express.json()); app.use('/api/auth', router);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = async (endpoint, input) => { const result = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); return { code: result.status, body: await result.json() }; };
  const relative = await post('register-relative', body()); assert.equal(relative.code, 201);
  const logged = await post('login', { tenDangNhap: 'fixture.relative', matKhau: 'Fixture-123', platform: 'web' });
  assert.equal(logged.code, 200); assert.equal(jwt.verify(logged.body.data.token, 'registration-fixture-secret').tenVaiTro, 'NguoiThan');
  const mobile = await post('login', { tenDangNhap: 'fixture.relative', matKhau: 'Fixture-123', platform: 'mobile' }); assert.equal(mobile.code, 200);
  const elderly = await post('register', body({ tenDangNhap: 'fixture.elderly', email: 'elderly@example.invalid', loaiTaiKhoan: 'NguoiCaoTuoi', ngaySinh: '1950-05-28', gioiTinh: 'Nam' }));
  assert.equal(elderly.code, 201); assert.equal(elderly.body.data.nguoiCaoTuoiId, 801); assert.equal(f.state.profiles.length, 1);
  const caregiver = await post('register-caregiver', body({ tenDangNhap: 'fixture.caregiver', email: 'caregiver@example.invalid', loaiTaiKhoan: 'QuanTriVien' }));
  assert.equal(caregiver.code, 201); assert.equal(f.state.users[2].TenVaiTro, 'NguoiChamSoc'); assert.equal(f.state.users[2].TrangThai, 'ChoDuyet');
  const pending = await post('login', { tenDangNhap: 'fixture.caregiver', matKhau: 'Fixture-123', platform: 'web' });
  assert.equal(pending.code, 403); assert.equal(pending.body.errorCode, 'ACCOUNT_PENDING_APPROVAL');
  const forbidden = await post('register', body({ loaiTaiKhoan: 'QuanTriVien' })); assert.equal(forbidden.code, 400);
  assert.equal(f.state.users.length, 3); assert.equal(f.state.caregivers.length, 1);
});
