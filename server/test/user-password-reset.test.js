const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const bcrypt = require('bcryptjs');

function fixture(options = {}) {
  const statements = [];
  const pool = { request: () => ({
    values: {},
    input(key, _type, value) { this.values[key] = value; return this; },
    async query(statement) {
      statements.push({ statement, values: this.values });
      if (options.failSQL) throw new Error('TEST SQL FAILURE');
      return { recordset: options.notFound ? [] : [{ id: this.values.id }] };
    },
  }) };
  const filename = path.resolve(__dirname, '../src/controllers/nguoiDung.controller.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: name => name === '../config/db'
      ? { poolPromise: Promise.resolve(pool), sql: { Int: 'Int', VarChar: () => 'VarChar' } }
      : name === '../utils/response' ? {
        ok: (res, data, message, status = 200) => Object.assign(res, { status, data, message }),
        fail: (res, message, errorCode, status) => Object.assign(res, { status, message, errorCode }),
      } : createRequire(filename)(name),
  }, { filename });
  async function run({ role = 'QuanTriVien', id = '31', body = { matKhauMoi: 'New-Users-Password-123' } } = {}) {
    const res = {}; let error;
    await module.exports.resetPassword({ user: { tenVaiTro: role }, params: { id }, body }, res, e => { error = e; });
    return { res, error };
  }
  return { run, statements };
}

test('User password reset denies non-Admin roles before any SQL', async () => {
  for (const role of ['NguoiChamSoc', 'NguoiCaoTuoi', '', 'UnknownRole']) {
    const f = fixture(); const { res, error } = await f.run({ role });
    assert.equal(res.status, 403); assert.equal(error, undefined); assert.equal(f.statements.length, 0);
  }
});

test('User password reset validates ID, password byte limit and rejects injected fields before SQL', async () => {
  for (const id of ['0', '-1', '1e2', '1.5', '31 OR 1=1', '2147483648']) {
    const f = fixture(); const { res } = await f.run({ id });
    assert.equal(res.status, 422); assert.equal(res.errorCode, 'INVALID_ID'); assert.equal(f.statements.length, 0);
  }
  for (const body of [null, [], {}, { matKhauMoi: 123456 }, { matKhauMoi: '12345' },
    { matKhauMoi: '      ' }, { matKhauMoi: 'a'.repeat(73) }, { matKhauMoi: 'ắ'.repeat(25) },
    { matKhauMoi: 'valid-test', id: 1 }, { matKhauMoi: 'valid-test', vaiTro: 'QUAN_TRI' },
    { matKhauMoi: 'valid-test', trangThai: 'HoatDong' }]) {
    const f = fixture(); const { res } = await f.run({ body });
    assert.equal(res.status, 422); assert.equal(f.statements.length, 0);
  }
});

test('Admin reset uses a parameterized atomic hash/OTP update without touching role/status/profile or returning secrets', async () => {
  const f = fixture(); const { res, error } = await f.run();
  assert.equal(res.status, 200); assert.equal(error, undefined); assert.equal(res.data.id, 31);
  assert.equal(f.statements.length, 1);
  const { statement, values } = f.statements[0];
  assert.equal(values.id, 31); assert.equal(await bcrypt.compare('New-Users-Password-123', values.hash), true);
  assert.match(statement, /WHERE UserID=@id/);
  assert.match(statement, /OUTPUT INSERTED.UserID AS id/);
  assert.match(statement, /MaOTP=NULL,MaOTPHetHan=NULL,MaOTPGuiLuc=NULL,MaOTPCuaSoBatDau=NULL,SoLanGuiOTP=0/);
  assert.doesNotMatch(statement, /(?:SET|,)\s*(?:TrangThai|UserID|VaiTroID|HoTen|Email|SoDienThoai)\s*=/);
  assert.doesNotMatch(JSON.stringify(res), /New-Users-Password|MatKhauHash|\$2[aby]\$/);
});

test('Admin reset returns 404 for missing user and forwards SQL failure without false success', async () => {
  const missing = await fixture({ notFound: true }).run();
  assert.equal(missing.res.status, 404); assert.equal(missing.res.errorCode, 'NOT_FOUND');
  const failed = await fixture({ failSQL: true }).run();
  assert.ok(failed.error); assert.equal(failed.res.status, undefined);
});

test('User password reset route requires auth, Admin and QLNGUOIDUNG/sua; own password flow is unchanged', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/nguoiDung.routes.js'), 'utf8');
  assert.match(source, /router\.use\(auth\)/);
  const guard = source.indexOf("req.user?.tenVaiTro !== 'QuanTriVien'");
  const reset = source.indexOf("router.post('/:id/reset-password'");
  assert.ok(guard > 0 && reset > guard);
  assert.match(source, /router\.post\('\/:id\/reset-password', checkPermission\('QLNGUOIDUNG','sua'\), ctrl\.resetPassword\)/);
  assert.match(source, /router\.put\('\/me\/password', checkPermission\('QLHOSONCT','sua'\), ctrl\.changeMyPassword\)/);
});

test('Users UI exposes a separate Admin-only reset action, isolated confirm form and whitelisted service payload', () => {
  const root = path.resolve(__dirname, '../../frontend/src');
  const page = fs.readFileSync(path.join(root, 'pages/Users/UsersPage.jsx'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'services/userService.js'), 'utf8');
  assert.match(page, /canResetPassword = user\?\.tenVaiTro === 'QuanTriVien' && canEdit/);
  assert.match(page, /canResetPassword && <TableActionButton[^\n]+Đặt lại mật khẩu/);
  assert.match(page, /dependencies=\{\['matKhauMoi'\]\}/);
  assert.match(page, /value === getFieldValue\('matKhauMoi'\)/);
  assert.match(page, /rules=\{mobilePasswordRules\}/);
  assert.match(page, /if \(!canResetPassword \|\| !resetTarget \|\| resetting\) return/);
  assert.match(page, /resetUserPassword\(resetTarget.id, matKhauMoi\)/);
  assert.match(service, /axiosClient.post\(`\/users\/\$\{id\}\/reset-password`, \{ matKhauMoi \}\)/);
});
