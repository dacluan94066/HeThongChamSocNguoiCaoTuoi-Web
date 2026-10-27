const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const jwt = require('jsonwebtoken');
const { GoogleIdentityError } = require('../src/services/googleAuth.service');

function fixture({ linked = false, noAccount = false } = {}) {
  const identity = { subject: 'mobile-synthetic-sub', email: 'mobile@example.invalid', displayName: 'MOBILE DEMO', photoUrl: null };
  const state = { users: noAccount ? [] : [{ userId: 70, tenDangNhap: 'mobile.demo', hoTen: 'MOBILE DEMO', email: identity.email, vaiTroId: 3,
    tenVaiTro: 'NguoiCaoTuoi', trangThai: 'HoatDong', googleSubject: linked ? identity.subject : null }], profiles: [], queries: [], logs: [] };
  class Transaction {
    async begin() { this.before = JSON.parse(JSON.stringify({ users: state.users, profiles: state.profiles })); }
    async commit() {}
    async rollback() { state.users = this.before.users; state.profiles = this.before.profiles; }
  }
  class Request {
    constructor() { this.values = {}; }
    input(name, _type, value) { this.values[name] = value; return this; }
    async query(query) {
      state.queries.push(query); const v = this.values;
      if (query.includes('FROM NguoiDung nd') && query.includes('GoogleSubject')) return { recordset: state.users.filter(row => query.includes('WHERE nd.GoogleSubject=') ? row.googleSubject === v.googleSubject : row.email === v.email).map(row => ({ ...row })) };
      if (query.includes('SELECT VaiTroID')) return { recordset: [{ vaiTroId: 3 }] };
      if (query.includes('SELECT UserID FROM NguoiDung')) return { recordset: state.users.filter(row => row.googleSubject === v.googleSubject || row.email === v.email) };
      if (query.includes('FROM NguoiChamSoc')) return { recordset: [] };
      if (query.includes('INSERT INTO NguoiDung')) {
        const row = { userId: 100, tenDangNhap: v.tenDangNhap, hoTen: v.hoTen, email: v.email, vaiTroId: v.vaiTroId, googleSubject: v.googleSubject,
          tenVaiTro: 'NguoiCaoTuoi', trangThai: 'HoatDong' }; state.users.push(row); return { recordset: [{ userId: 100 }] };
      }
      if (query.includes('INSERT INTO HoSoNguoiCaoTuoi')) { state.profiles.push({ userId: v.userId }); return { recordset: [] }; }
      if (query.includes('INSERT INTO NhatKyDangNhap')) { state.logs.push({ ...v }); return { recordset: [] }; }
      if (query.includes('UPDATE NguoiDung SET LanDangNhapCuoi')) return { recordset: [] };
      throw Error('Unexpected SQL: ' + query.slice(0, 70));
    }
  }
  const filename = path.resolve(__dirname, '../src/controllers/auth.controller.js'), module = { exports: {} };
  const pool = { request: () => new Request() };
  const stubs = { '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'Int', Date: 'Date', VarChar: () => 'VarChar', NVarChar: () => 'NVarChar', Transaction, Request } },
    '../config/mailer': { sendMail: async () => { throw Error('External mail forbidden'); } },
    '../services/googleAuth.service': { GoogleIdentityError, verifyGoogleIdToken: async token => { if (token !== 'synthetic-google') throw new GoogleIdentityError('Invalid fixture token', 'INVALID_GOOGLE_TOKEN', 401); return identity; } } };
  stubs['./googleWeb.controller'] = { createGoogleWebController: deps => ({ createSession: deps.createSession }) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: name => stubs[name] ?? createRequire(filename)(name),
    process: { env: { JWT_SECRET: 'mobile-google-fixture-secret', JWT_EXPIRES_IN: '5m' } }, console, Buffer }, { filename });
  const call = async body => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(result) { this.body = result; return this; } };
    await module.exports.googleLogin({ body: { idToken: 'synthetic-google', ...body }, ip: '127.0.0.1' }, res, error => { throw error; }); return res;
  };
  return { state, identity, call, createWebSession: () => module.exports.googleWeb.createSession(pool, { ip: '127.0.0.1' }, state.users[0]) };
}
test('Mobile returning Google account keeps ID, JWT claims and Mobile login audit, even after its email changes', async () => {
  const f = fixture({ linked: true }); f.identity.email = 'changed-google@example.invalid';
  f.state.users.push({ userId: 71, email: f.identity.email, googleSubject: null });
  const res = await f.call(); assert.equal(res.statusCode, 200); assert.equal(res.body.data.user.userId, 70);
  const token = jwt.verify(res.body.data.token, 'mobile-google-fixture-secret'); assert.equal(token.userId, 70); assert.equal(token.sessionVersion, 2); assert.equal(token.tenVaiTro, 'NguoiCaoTuoi');
  assert.equal(f.state.users.length, 2); assert.equal(f.state.profiles.length, 0); assert.equal(f.state.logs[0].thietBi, 'Mobile');
});
test('Mobile existing unlinked email now requires explicit linking, without updating subject or creating another user/profile', async () => {
  const f = fixture(), res = await f.call();
  assert.equal(res.statusCode, 409); assert.equal(res.body.errorCode, 'GOOGLE_LINK_REQUIRED'); assert.equal(f.state.users[0].googleSubject, null);
  assert.equal(f.state.users.length, 1); assert.equal(f.state.profiles.length, 0); assert.equal(res.body.data, undefined);
  assert.ok(!f.state.queries.some(query => /UPDATE NguoiDung\s+SET GoogleSubject/.test(query)));
});
test('Mobile new Google registration keeps its two-step flow and creates exactly one account/profile in RAM', async () => {
  const f = fixture({ noAccount: true }), first = await f.call(); assert.equal(first.body.data.requiresRegistration, true); assert.equal(f.state.users.length, 0);
  const fields = { loaiTaiKhoan: 'NguoiCaoTuoi', hoTen: 'MOBILE DEMO', soDienThoai: '0000000075', ngaySinh: '1950-01-01', gioiTinh: 'Nam' };
  const registered = await f.call(fields); assert.equal(registered.statusCode, 201); assert.equal(registered.body.data.user.userId, 100);
  const repeated = await f.call(fields); assert.equal(repeated.statusCode, 200); assert.equal(repeated.body.data.user.userId, 100);
  assert.equal(f.state.users.length, 1); assert.deepEqual(f.state.profiles, [{ userId: 100 }]); assert.equal(f.state.users[0].googleSubject, f.identity.subject);
});
test('Mobile linked identity cannot sign in as another role or locked account; invalid Google proof is refused', async () => {
  for (const role of ['NguoiThan', 'QuanTriVien', 'NguoiChamSoc']) { const f = fixture({ linked: true }); f.state.users[0].tenVaiTro = role; assert.equal((await f.call()).statusCode, 403); }
  const f = fixture({ linked: true }); f.state.users[0].trangThai = 'KhoaTaiKhoan'; assert.equal((await f.call()).statusCode, 403);
  assert.equal((await f.call({ idToken: 'bad-token' })).statusCode, 401);
});
test('Web Google shares the existing JWT contract and records Web audit without revoking Mobile', async () => {
  const f = fixture({ linked: true }), mobile = await f.call(), web = await f.createWebSession();
  const a = jwt.verify(mobile.body.data.token, 'mobile-google-fixture-secret'), b = jwt.verify(web.token, 'mobile-google-fixture-secret');
  for (const field of ['userId', 'vaiTroId', 'tenVaiTro', 'sessionVersion']) assert.equal(a[field], b[field]);
  assert.deepEqual(f.state.logs.map(row => row.thietBi), ['Mobile', 'Web']); assert.equal(f.state.users.length, 1); assert.equal(f.state.profiles.length, 0);
});
