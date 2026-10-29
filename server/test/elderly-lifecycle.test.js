const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('Stopping elderly profile teardown closes assignments, revokes relatives, locks account, cancels appointments, and disconnects socket', async () => {
  const queries = [];
  let disconnectedUserId = null;
  let adminEvent = null;

  const pool = {
    request: () => {
      const inputs = {};
      return {
        input(key, type, val) { inputs[key] = val; return this; },
        async query(statement) {
          queries.push(statement);
          if (statement.includes('SELECT NguoiCaoTuoiID, UserID FROM HoSoNguoiCaoTuoi')) {
            return { recordset: [{ NguoiCaoTuoiID: 55, UserID: 105 }] };
          }
          return { recordset: [] };
        },
      };
    },
  };

  const filename = path.resolve(__dirname, '../src/controllers/hoSoNguoiCaoTuoi.controller.js');
  const module = { exports: {} }, local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console,
    require: name => ({
      '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'Int', NVarChar: 'String', Date: 'Date', VarChar: 'VarChar' } },
      '../utils/response': { ok: (res, data, msg) => Object.assign(res, { status: 200, data, msg }), fail: (res, msg, code, status) => Object.assign(res, { status, code, msg }) },
      '../middlewares/mobile-scope.middleware': { scopedWhere: () => '' },
      '../socket': {
        emitToAdmin: (evt, data) => { adminEvent = { evt, data }; },
        disconnectUser: (uid) => { disconnectedUserId = uid; },
      },
    }[name] || local(name)),
  }, { filename });

  const res = {};
  await module.exports.remove({ params: { id: '55' }, user: { userId: 1 } }, res, err => { throw err; });

  assert.equal(res.status, 200);
  assert.equal(disconnectedUserId, 105);
  assert.equal(adminEvent?.evt, 'elderly:updated');
  assert.equal(adminEvent?.data?.id, 55);
  assert.equal(adminEvent?.data?.trangThai, 'NgungTheoDoi');

  const teardownSql = queries.find(q => q.includes("UPDATE HoSoNguoiCaoTuoi SET TrangThai = N'NgungTheoDoi'"));
  assert.ok(teardownSql);
  assert.match(teardownSql, /UPDATE NguoiCaoTuoi_NguoiChamSoc/);
  assert.match(teardownSql, /UPDATE NguoiCaoTuoi_NguoiThan/);
  assert.match(teardownSql, /LichSuLienKetNguoiThan/);
  assert.match(teardownSql, /UPDATE LichKhamBenh/);
  assert.match(teardownSql, /UPDATE NguoiDung/);
  assert.match(teardownSql, /TrangThai = N'KhoaTaiKhoan'/);
  assert.match(teardownSql, /COMMIT TRANSACTION/);
});

test('Re-opening elderly profile to DangTheoDoi does not restore links or account', async () => {
  const queries = [];
  const pool = {
    request: () => {
      const inputs = {};
      return {
        input(key, type, val) { inputs[key] = val; return this; },
        async query(statement) {
          queries.push(statement);
          if (statement.includes('SELECT NguoiCaoTuoiID, UserID FROM HoSoNguoiCaoTuoi')) {
            return { recordset: [{ NguoiCaoTuoiID: 55, UserID: 105 }] };
          }
          return { recordset: [] };
        },
      };
    },
  };

  const filename = path.resolve(__dirname, '../src/controllers/hoSoNguoiCaoTuoi.controller.js');
  const module = { exports: {} }, local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console,
    require: name => ({
      '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'Int', NVarChar: 'String', Date: 'Date', VarChar: 'VarChar' } },
      '../utils/response': { ok: (res, data, msg) => Object.assign(res, { status: 200, data, msg }), fail: (res, msg, code, status) => Object.assign(res, { status, code, msg }) },
      '../middlewares/mobile-scope.middleware': { scopedWhere: () => '' },
      '../socket': { emitToAdmin() {}, disconnectUser() {} },
    }[name] || local(name)),
  }, { filename });

  const res = {};
  await module.exports.update({
    params: { id: '55' },
    body: { hoTen: 'Nguyễn Văn A', ngaySinh: '1950-01-01', gioiTinh: 'Nam', trangThai: 'DangTheoDoi' },
    user: { userId: 1 },
  }, res, err => { throw err; });

  assert.equal(res.status, 200);
  const updateSql = queries.find(q => q.includes('UPDATE HoSoNguoiCaoTuoi SET'));
  assert.ok(updateSql);
  assert.doesNotMatch(updateSql, /UPDATE NguoiCaoTuoi_NguoiChamSoc/);
  assert.doesNotMatch(updateSql, /UPDATE NguoiCaoTuoi_NguoiThan/);
  assert.doesNotMatch(updateSql, /UPDATE NguoiDung/);
});
