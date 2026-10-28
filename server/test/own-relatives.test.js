const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
const { createOwnRelativesReader } = require('../src/services/ownRelatives.service');

function fixture() {
  const state = { ready: true, owner: true, queries: [], rows: [
    { id: 71, nguoiCaoTuoiId: 201, hoTen: 'Người thân fixture', soDienThoai: null, moiQuanHe: 'Con gái',
      profileRead: 1, healthRead: 1, medicationRead: 1, appointmentRead: 0, alertRead: 1,
      benhNen: true, diUng: false, ketQuaKham: true, CanCuDongY: 'SECRET', MatKhauHash: 'SECRET', GPS: 'SECRET' },
  ] };
  const sql = { Int: 'Int' }, pool = { request: () => {
    const params = {}; return { input(key, _type, value) { params[key] = value; return this; }, async query(text) {
      state.queries.push({ text, params }); assert.doesNotMatch(text, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP)\b/i);
      if (text.includes(' AS ready')) return { recordset: [{ ready: state.ready ? 1 : 0 }] };
      if (text.includes('SELECT nct.NguoiCaoTuoiID AS id')) return { recordset: state.owner ? [{ id: 201 }] : [] };
      return { recordset: state.owner ? state.rows : [] };
    } };
  } };
  return { state, sql, pool, read: createOwnRelativesReader({ poolPromise: Promise.resolve(pool), sql }) };
}
const user = { userId: 10, tenVaiTro: 'NguoiCaoTuoi' };
test('Own family list uses JWT owner twice, returns only contact/scope fields and intersects consent with current read permissions', async () => {
  const f = fixture(), rows = await f.read(user, {}), row = rows[0];
  assert.deepEqual(Object.keys(row).sort(), ['hoTen', 'id', 'moiQuanHe', 'nguoiCaoTuoiId', 'phamViChiaSe', 'soDienThoai']);
  assert.equal(row.soDienThoai, null); assert.equal(row.phamViChiaSe.benhNen, true);
  assert.equal(row.phamViChiaSe.diUng, false); assert.equal(row.phamViChiaSe.ketQuaKham, false);
  const query = f.state.queries.at(-1);
  assert.deepEqual(query.params, { userId: 10 });
  for (const pattern of [/nct.UserID=@userId/, /ownerRole.TenVaiTro=N'NguoiCaoTuoi'/,
    /lk.ThuHoiLuc IS NULL/, /lk.DongYChiaSe=1/, /lk.TaoLuc<=SYSUTCDATETIME\(\)/,
    /nd.TrangThai=N'HoatDong'/, /vt.TenVaiTro=N'NguoiThan'/, /pq.ChoPhepXem=1/]) assert.match(query.text, pattern);
  assert.doesNotMatch(query.text, /SELECT\s+\*|CanCuDongY|MatKhauHash|CCCD|DiaChi|ViDo|KinhDo/);
});
test('All other roles are refused before SQL, even if given profile-read permission elsewhere', async () => {
  const f = fixture();
  for (const tenVaiTro of ['QuanTriVien', 'NguoiChamSoc', 'NguoiThan', undefined]) {
    await assert.rejects(f.read({ userId: 1, tenVaiTro }, {}), { status: 403 });
  }
  assert.equal(f.state.queries.length, 0);
});
test('Cannot substitute target elderly/account IDs or query revoked links', async () => {
  const f = fixture();
  for (const query of [{ id: 999 }, { nguoiCaoTuoiId: 999 }, { userId: 2 }, { includeRevoked: 'true' }, { offset: 0 }]) {
    await assert.rejects(f.read(user, query), { status: 422 });
  }
  assert.equal(f.state.queries.length, 0);
});
test('No profile is explicit 404; absent additive schema is explicit 503 and never triggers migration', async () => {
  const f = fixture(); f.state.owner = false;
  await assert.rejects(f.read(user), { status: 404, code: 'ELDERLY_PROFILE_NOT_FOUND' });
  assert.equal(f.state.queries.length, 1); f.state.owner = true; f.state.ready = false;
  await assert.rejects(f.read(user), { status: 503, code: 'RELATIVES_NOT_INSTALLED' });
});
test('Repeated reads reflect revocation and changed permissions; true consent does not override a denied feature', async () => {
  const f = fixture(); await f.read(user);
  f.state.rows[0].profileRead = 0; f.state.rows[0].healthRead = null;
  const row = (await f.read(user))[0];
  assert.equal(row.phamViChiaSe.hoSoCoBan, false); assert.equal(row.phamViChiaSe.chiSoSucKhoe, false);
  assert.equal(row.phamViChiaSe.benhNen, false);
  f.state.rows = []; assert.deepEqual(await f.read(user), []);
});
test('Own endpoint JSON is no-store, handles missing schema, and hides unexpected SQL failure details', async () => {
  const f = fixture(), filename = path.resolve(__dirname, '../src/controllers/ownRelatives.controller.js'), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: name => name === '../config/db' ? { poolPromise: Promise.resolve(f.pool), sql: f.sql } : createRequire(filename)(name),
  }, { filename });
  const response = () => ({ headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const res = response(); await module.exports.getMine({ user, query: {} }, res);
  assert.equal(res.code, 200); assert.equal(res.headers['Cache-Control'], 'no-store'); assert.equal(res.body.success, true);
  f.state.ready = false; const missing = response(); await module.exports.getMine({ user, query: {} }, missing);
  assert.equal(missing.code, 503);
  f.pool.request = () => { throw Error('SECRET SQL CONNECTION'); };
  const failure = response(); await module.exports.getMine({ user, query: {} }, failure);
  assert.equal(failure.code, 503); assert.doesNotMatch(JSON.stringify(failure.body), /SECRET/);
});
test('Self-relative route is declared once behind existing profile-read permission and never accepts :id', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/hoSoNguoiCaoTuoi.routes.js'), 'utf8');
  assert.equal((source.match(/router.get\('\/me\/relatives'/g) || []).length, 1);
  assert.match(source, /router.get\('\/me\/relatives', checkPermission\('QLHOSONCT','xem'\), ownRelatives.getMine\)/);
});
