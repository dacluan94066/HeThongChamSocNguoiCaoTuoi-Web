const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createLinkedRelativeContacts } = require('../src/services/emergencyContactRelatives.service');

function fixture() {
  const state = { ready: true, assigned: true, linked: true, queries: [], rows: [
    { id: 71, hoTen: 'Người thân fixture', moiQuanHe: 'Con gái', soDienThoai: '0000000001',
      email: 'relative@example.invalid', CanCuDongY: 'Never expose', GPS: 'Never expose', MatKhauHash: 'Never expose' },
  ] };
  const sql = { Int: 'Int', NVarChar: n => `NVarChar(${n})` };
  const pool = { request: () => {
    const params = {};
    return { input(key, _type, value) { params[key] = value; return this; }, async query(text) {
      state.queries.push({ text, params });
      assert.doesNotMatch(text, /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP)\b/i);
      if (text.includes(' AS ready')) return { recordset: [{ ready: state.ready ? 1 : 0 }] };
      const allowed = params.elderlyId === 201 && (params.actorRole === 'QuanTriVien' || state.assigned);
      if (text.includes('SELECT NguoiCaoTuoiID AS id')) return { recordset: allowed ? [{ id: 201 }] : [] };
      return { recordset: allowed && state.linked ? state.rows : [] };
    } };
  } };
  return { state, sql, pool, read: createLinkedRelativeContacts({ poolPromise: Promise.resolve(pool), sql }) };
}
const admin = { userId: 1, tenVaiTro: 'QuanTriVien' }, caregiver = { userId: 2, tenVaiTro: 'NguoiChamSoc' };

test('Admin and assigned caregiver read only contact suggestion fields, with no data write', async () => {
  for (const user of [admin, caregiver]) {
    const f = fixture(), rows = await f.read(user, { nguoiCaoTuoiId: '201' });
    assert.deepEqual(Object.keys(rows[0]).sort(), ['email', 'hoTen', 'id', 'moiQuanHe', 'soDienThoai']);
    assert.equal(rows[0].hoTen, 'Người thân fixture');
    const query = f.state.queries.at(-1);
    assert.equal(query.params.elderlyId, 201); assert.equal(query.params.actorId, user.userId);
    for (const pattern of [/lk.ThuHoiLuc IS NULL/, /lk.DongYChiaSe=1/, /lk.TaoLuc<=SYSUTCDATETIME\(\)/,
      /nd.TrangThai=N'HoatDong'/, /vt.TenVaiTro=N'NguoiThan'/, /care.NgayKetThuc/, /actor.UserID=@actorId/]) assert.match(query.text, pattern);
    assert.doesNotMatch(query.text, /SELECT\s+\*|CanCuDongY|NguoiDongY|MatKhauHash|DiaChi|GPS/);
  }
});
test('Unassigned caregiver and substituted elderly ID are forbidden before reading family data', async () => {
  const f = fixture(); f.state.assigned = false;
  await assert.rejects(f.read(caregiver, { nguoiCaoTuoiId: 201 }), { code: 'FORBIDDEN_ELDERLY', status: 403 });
  f.state.assigned = true;
  await assert.rejects(f.read(caregiver, { nguoiCaoTuoiId: 999 }), { code: 'FORBIDDEN_ELDERLY', status: 403 });
  assert.equal(f.state.queries.length, 2);
});
test('Elderly, family and unknown roles cannot obtain contact suggestions even with invented permissions', async () => {
  const f = fixture();
  for (const tenVaiTro of ['NguoiCaoTuoi', 'NguoiThan', 'Other', undefined]) {
    await assert.rejects(f.read({ userId: 3, tenVaiTro }, { nguoiCaoTuoiId: 201 }), { code: 'FORBIDDEN', status: 403 });
  }
  assert.equal(f.state.queries.length, 0);
});
test('Missing/invalid IDs and extra consent/account/filter fields fail validation before SQL', async () => {
  const f = fixture();
  for (const query of [{}, { nguoiCaoTuoiId: '201 OR 1=1' }, { nguoiCaoTuoiId: 0 },
    { nguoiCaoTuoiId: ['201', '202'] }, { nguoiCaoTuoiId: 201, includeRevoked: 'true' },
    { nguoiCaoTuoiId: 201, nguoiThanUserId: 5 }]) {
    await assert.rejects(f.read(admin, query), { status: 422 });
  }
  assert.equal(f.state.queries.length, 0);
});
test('Missing family schema fails clearly without migrations or legacy data writes', async () => {
  const f = fixture(); f.state.ready = false;
  await assert.rejects(f.read(admin, { nguoiCaoTuoiId: 201 }), { status: 503, code: 'RELATIVES_NOT_INSTALLED' });
  assert.equal(f.state.queries.length, 2);
});
test('Revocation is read afresh; null contact phone remains null and never gets invented', async () => {
  const f = fixture(); f.state.rows[0].soDienThoai = null;
  assert.equal((await f.read(admin, { nguoiCaoTuoiId: 201 }))[0].soDienThoai, null);
  f.state.linked = false;
  assert.deepEqual(await f.read(admin, { nguoiCaoTuoiId: 201 }), []);
  f.state.assigned = false;
  await assert.rejects(f.read(caregiver, { nguoiCaoTuoiId: 201 }), { status: 403 });
});

function load(filename, stubs) {
  const full = path.resolve(__dirname, filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(full, 'utf8'), { module, exports: module.exports,
    require: name => stubs[name] ?? createRequire(full)(name) }, { filename: full });
  return module.exports;
}
test('Actual Express route requires authentication and both read/create permissions, and sends no-store safe output', async t => {
  const express = require('express'), f = fixture();
  let allowed = true, role = 'NguoiChamSoc', authenticated = true;
  const db = { poolPromise: Promise.resolve(f.pool), sql: f.sql };
  const controller = load('../src/controllers/lienHeKhanCap.controller.js', { '../config/db': db,
    '../middlewares/mobile-scope.middleware': {} });
  const route = load('../src/routes/lienHeKhanCap.routes.js', {
    '../controllers/lienHeKhanCap.controller': controller,
    '../middlewares/auth.middleware': (req, res, next) => { if (!authenticated) return res.sendStatus(401); req.user = { userId: 2, tenVaiTro: role }; next(); },
    '../middlewares/mobile-scope.middleware': { loadMobileScope: (_req, _res, next) => next(),
      guardResource: () => (_req, _res, next) => next(), caregiverOnlyWrite: (_req, _res, next) => next() },
    '../middlewares/permission.middleware': { checkPermission: (feature, action) => (req, res, next) => {
      assert.equal(feature, 'QLLIENHEKC');
      if (!allowed && action === 'them') return res.sendStatus(403); next();
    } },
  });
  const app = express(); app.use('/api/emergency-contacts', route);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/emergency-contacts/linked-relatives?nguoiCaoTuoiId=201`;
  let res = await fetch(url); assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json(); assert.equal(body.success, true); assert.equal('MatKhauHash' in body.data[0], false);
  allowed = false; assert.equal((await fetch(url)).status, 403);
  allowed = true; role = 'NguoiThan'; assert.equal((await fetch(url)).status, 403);
  role = 'NguoiCaoTuoi'; assert.equal((await fetch(url)).status, 403);
  authenticated = false; assert.equal((await fetch(url)).status, 401);
});
