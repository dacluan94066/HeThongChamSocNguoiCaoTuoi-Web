const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function makeLoginController(users) {
  const filename = path.resolve(__dirname, '../src/controllers/auth.controller.js');
  const module = { exports: {} };
  let lookupQuery = '';
  const statements = [];
  const pool = {
    request() {
      const inputs = {};
      return {
        input(name, _type, value) { inputs[name] = value; return this; },
        async query(query) {
          statements.push({ query, inputs: { ...inputs } });
          if (query.includes('FROM NguoiDung nd') && query.includes('INNER JOIN VaiTro')) {
            lookupQuery = query;
            return { recordset: users.filter((user) =>
              user.TenDangNhap === inputs.tenDangNhap
              || user.Email?.trim().toLowerCase() === inputs.email
              || user.SoDienThoai?.trim() === inputs.phone) };
          }
          if (query.includes('UPDATE NguoiDung SET LanDangNhapCuoi')
            || query.includes('INSERT INTO NhatKyDangNhap')) return { recordset: [] };
          throw new Error(`Unexpected query: ${query.slice(0, 100)}`);
        },
      };
    },
  };
  const stubs = {
    '../config/db': {
      poolPromise: Promise.resolve(pool),
      sql: { Int: 'Int', VarChar: () => 'VarChar', NVarChar: () => 'NVarChar' },
    },
    '../config/mailer': { sendMail: async () => {} },
    '../utils/response': {
      ok(res, data, _message, status = 200) { res.status = status; res.data = data; },
      fail(res, message, code, status) { res.status = status; res.message = message; res.error = code; },
    },
    '../services/googleAuth.service': {
      GoogleIdentityError: Error, verifyGoogleIdToken: async () => {},
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports,
    require: (name) => stubs[name] ?? createRequire(filename)(name),
    process: { env: { JWT_SECRET: 'test-only-secret', JWT_EXPIRES_IN: '5m' } },
    console,
  }, { filename });
  return { login: module.exports.login, getLookupQuery: () => lookupQuery, statements };
}

test('password login accepts username, case-insensitive email, and phone', async () => {
  const passwordHash = await bcrypt.hash('correct-password', 4);
  const user = {
    UserID: 10, TenDangNhap: 'elder.one', MatKhauHash: passwordHash,
    HoTen: 'Người cao tuổi', Email: 'Elder@Example.com', SoDienThoai: '0912345678',
    TrangThai: 'HoatDong', VaiTroID: 3, TenVaiTro: 'NguoiCaoTuoi',
  };
  const { login, getLookupQuery } = makeLoginController([user]);
  for (const identifier of ['elder.one', ' ELDER@example.COM ', '0912345678']) {
    const res = {};
    await login({ body: { tenDangNhap: identifier, matKhau: 'correct-password', platform: 'mobile' },
      ip: '127.0.0.1' }, res, (error) => { throw error; });
    assert.equal(res.status, 200, identifier);
    assert.equal(res.data.user.userId, 10);
    assert.ok(res.data.token);
  }
  assert.match(getLookupQuery(), /nd\.TenDangNhap = @tenDangNhap/);
  assert.match(getLookupQuery(), /LOWER\(LTRIM\(RTRIM\(nd\.Email\)\)\) = @email/);
  assert.match(getLookupQuery(), /LTRIM\(RTRIM\(nd\.SoDienThoai\)\) = @phone/);

  const wrongPassword = {};
  await login({ body: { tenDangNhap: '0912345678', matKhau: 'wrong-password' },
    ip: '127.0.0.1' }, wrongPassword, (error) => { throw error; });
  assert.equal(wrongPassword.status, 401);
});

test('NCT Web and Mobile use the same account and JWT contract, without creating profiles', async () => {
  const user = { UserID: 70, TenDangNhap: 'fixture.elder', MatKhauHash: await bcrypt.hash('fixture-pass', 4),
    HoTen: 'NCT fixture', Email: 'elder@example.invalid', SoDienThoai: '0899999970',
    TrangThai: 'HoatDong', VaiTroID: 3, TenVaiTro: 'NguoiCaoTuoi' };
  const fixture = makeLoginController([user]);
  for (const platform of ['web', 'mobile']) {
    for (const identifier of [user.TenDangNhap, 'ELDER@example.invalid', user.SoDienThoai]) {
      const res = {};
      await fixture.login({ body: { tenDangNhap: identifier, matKhau: 'fixture-pass', platform } }, res, error => { throw error; });
      assert.equal(res.status, 200);
      assert.equal(res.data.user.userId, 70);
      const claims = jwt.verify(res.data.token, 'test-only-secret');
      assert.equal(claims.userId, 70); assert.equal(claims.tenVaiTro, 'NguoiCaoTuoi'); assert.equal(claims.sessionVersion, 2);
      assert.equal(claims.platform, undefined); // No platform impersonation or JWT migration.
    }
  }
  const logs = fixture.statements.filter(item => item.query.includes('INSERT INTO NhatKyDangNhap'));
  assert.deepEqual(logs.map(item => item.inputs.thietBi), ['Web', 'Web', 'Web', 'Mobile', 'Mobile', 'Mobile']);
  assert.equal(fixture.statements.some(item => /INSERT INTO (?:HoSoNguoiCaoTuoi|NguoiDung)/.test(item.query)), false);
});

test('Web role regression: four known active roles sign in; locked/pending/bad credentials are rejected', async () => {
  const hash = await bcrypt.hash('fixture-pass', 4);
  for (const role of ['QuanTriVien', 'NguoiChamSoc', 'NguoiThan', 'NguoiCaoTuoi']) {
    const user = { UserID: 70, TenDangNhap: 'fixture', MatKhauHash: hash, TrangThai: 'HoatDong', VaiTroID: 3, TenVaiTro: role };
    const call = async (account, password = 'fixture-pass', platform = 'web') => {
      const res = {};
      await makeLoginController([account]).login({ body: { tenDangNhap: 'fixture', matKhau: password, platform } }, res, error => { throw error; });
      return res;
    };
    assert.equal((await call(user)).status, 200);
    assert.equal((await call(user, 'wrong-pass')).status, 401);
    assert.equal((await call({ ...user, TrangThai: 'KhoaTaiKhoan' })).error, 'ACCOUNT_LOCKED');
    assert.equal((await call({ ...user, TrangThai: 'ChoDuyet' })).error, 'ACCOUNT_PENDING_APPROVAL');
    assert.equal((await call(user, 'fixture-pass', 'invalid')).status, 403);
    if (role !== 'NguoiCaoTuoi') assert.equal((await call(user, 'fixture-pass', 'mobile')).error, 'MOBILE_ACCESS_DENIED');
  }
});

test('ambiguous identifier never picks a different account', async () => {
  const passwordHash = await bcrypt.hash('correct-password', 4);
  const users = [
    { UserID: 1, TenDangNhap: '0912345678', Email: 'first@example.com',
      SoDienThoai: '0900000001', MatKhauHash: passwordHash },
    { UserID: 2, TenDangNhap: 'second', Email: 'second@example.com',
      SoDienThoai: '0912345678', MatKhauHash: passwordHash },
  ];
  const { login } = makeLoginController(users);
  const res = {};
  await login({ body: { tenDangNhap: '0912345678', matKhau: 'correct-password' } },
    res, (error) => { throw error; });
  assert.equal(res.status, 401);
  assert.equal(res.error, 'INVALID_CREDENTIALS');
});
