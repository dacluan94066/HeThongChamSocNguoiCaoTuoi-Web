const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { validateElderlyProfile } = require('../src/utils/elderlyProfileValidation');
const { validateMetricValues, validateMeasurementTime } = require('../src/utils/healthMetricValidation');
const { todayVietnam } = require('../src/utils/vietnamDate');

const profile = () => ({ hoTen: 'Nguyễn Thị An', ngaySinh: '1950-02-10', gioiTinh: 'Nữ',
  soDienThoai: '0901234567', cccd: '012345678901' });

function loadController(relative, stubs) {
  const filename = path.resolve(__dirname, relative);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports,
    require: (name) => stubs[name] ?? createRequire(filename)(name),
    console,
  }, { filename });
  return module.exports;
}

const response = { ok: (res, data, message, status = 200) => Object.assign(res, { status, data, message }),
  fail: (res, message, errorCode, status) => Object.assign(res, { status, errorCode, message }) };

test('Elderly profile validation checks each database field and Vietnam birth date', () => {
  assert.equal(validateElderlyProfile(profile()).error, undefined);
  const cases = [
    [{ hoTen: '  ' }, 'hoTen'],
    [{ ngaySinh: '2026-02-30' }, 'ngaySinh'],
    [{ ngaySinh: new Date(Date.now()+9*86400000).toISOString().slice(0,10) }, 'ngaySinh'],
    [{ gioiTinh: 'Nam khác' }, 'gioiTinh'],
    [{ soDienThoai: '9123456789' }, 'soDienThoai'],
    [{ cccd: '123456789' }, 'cccd'],
    [{ diaChi: 'X'.repeat(256) }, 'diaChi'],
    [{ benhNen: ['X'.repeat(501)] }, 'benhNen'],
  ];
  for (const [change, field] of cases) {
    assert.equal(validateElderlyProfile({ ...profile(), ...change }).error.field, field);
  }
  assert.equal(validateElderlyProfile({ ...profile(), soDienThoai: null, cccd: null }).error, undefined);
});

test('Mobile registration returns field-specific 422 before contacting the database', async () => {
  const auth = loadController('../src/controllers/auth.controller.js', {
    '../config/db': { poolPromise: { then() { throw new Error('database should not be reached'); } }, sql: {} },
    '../utils/response': response,
    '../config/mailer': { sendMail: async () => {} },
    '../services/googleAuth.service': { GoogleIdentityError: Error, verifyGoogleIdToken: async () => {} },
  });
  const res = {};
  await auth.register({ body: { tenDangNhap: 'testuser', matKhau: 'password',
    email: 'test@example.com', ...profile(), cccd: '123' } }, res, (error) => { throw error; });
  assert.equal(res.status, 422);
  assert.equal(res.errorCode, 'INVALID_CCCD');
});

test('Web create and update elderly reject bad fields before database lookup', async () => {
  const controller = loadController('../src/controllers/hoSoNguoiCaoTuoi.controller.js', {
    '../config/db': { poolPromise: { then() { throw new Error('database should not be reached'); } }, sql: {} },
    '../utils/response': response,
    '../middlewares/mobile-scope.middleware': { scopedWhere: () => '' },
  });
  for (const handler of [controller.create, controller.update]) {
    const res = {};
    await handler({ body: { ...profile(), soDienThoai: '123' }, params: { id: '1' },
      user: { userId: 4 } }, res, (error) => { throw error; });
    assert.equal(res.status, 422);
    assert.equal(res.errorCode, 'INVALID_SODIENTHOAI');
  }
  const invalidStatus = {};
  await controller.update({ body: { ...profile(), trangThai: 'Không rõ' }, params: { id: '1' },
    user: { userId: 4 } }, invalidStatus, (error) => { throw error; });
  assert.equal(invalidStatus.status, 422);
  assert.equal(invalidStatus.errorCode, 'INVALID_TRANGTHAI');
});

test('Health measurement limits use the stored mg/dL unit and reject future clocks', () => {
  const types = [
    ['Huyết áp', 'mmHg', 120, 80, null],
    ['Nhịp tim', 'lần/phút', 75, null, null],
    ['Đường huyết', 'mg/dL', 110, null, null],
    ['Nhiệt độ cơ thể', '°C', 36.5, null, null],
    ['SpO2', '%', 98, null, null],
    ['Cân nặng', 'kg', 65, null, null],
  ];
  for (const [TenChiSo, DonVi, primary, secondary, expected] of types) {
    assert.equal(validateMetricValues({ TenChiSo, DonVi }, primary, secondary), expected);
    assert.ok(validateMetricValues({ TenChiSo, DonVi }, 0, secondary));
    assert.ok(validateMetricValues({ TenChiSo, DonVi }, 900, secondary));
  }
  assert.match(validateMetricValues({ TenChiSo: 'Huyết áp', DonVi: 'mmHg' }, 80, 90), /lớn hơn/);
  assert.ok(validateMetricValues({ TenChiSo: 'Đường huyết', DonVi: 'mmol\/L' }, 100, null));
  const tomorrow = new Date(Date.now()+2*86400000+7*3600000).toISOString().slice(0,10);
  assert.match(validateMeasurementTime({ ngayDo: tomorrow, gioDo: '08:00' }), /tương lai/);
  assert.match(validateMeasurementTime({ ngayDo: '2026-02-30', gioDo: '08:00' }), /không hợp lệ/);
});

test('Both medication APIs reject unknown states before SQL and reject other dates', async () => {
  let queries = 0;
  const pool = { request: () => ({ input() { return this; }, async query() {
    queries++;
    return { recordset: [{ id: 1, ownerUserId: 4, scheduleDate: '2020-01-01' }] };
  } }) };
  const controller = loadController('../src/controllers/lichUongThuoc.controller.js', {
    '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'Int', NVarChar: () => 'NVarChar' } },
    '../utils/response': response,
    '../socket': { emitToAdmin() {}, emitToUser() {} },
    '../middlewares/mobile-scope.middleware': { scopedWhere: () => '' },
  });
  for (const handler of [controller.confirmMine, controller.updateStatus]) {
    const beforeInvalid = queries;
    const invalid = {};
    await handler({ params: { id: '1' }, body: { trangThai: 'ChuaDenGio' }, user: { userId: 4 } },
      invalid, (error) => { throw error; });
    assert.equal(invalid.status, 422);
    assert.equal(queries, beforeInvalid);
    const old = {};
    await handler({ params: { id: '1' }, body: { trangThai: 'DaUong' }, user: { userId: 4 } },
      old, (error) => { throw error; });
    assert.equal(old.status, 422);
    assert.equal(old.errorCode, 'NOT_TODAY');
  }
  assert.notEqual(todayVietnam(), '2020-01-01');
});

test('A future appointment cannot be marked examined or given a result', async () => {
  let writes = 0;
  const future = new Date(Date.now()+8*3600000).toISOString().slice(0,19);
  const pool = { request: () => ({ input() { return this; }, async query(query) {
    if (query.includes('UPDATE LichKhamBenh')) writes++;
    return { recordset: [{ elderlyId: 2, appointmentTime: future }] };
  } }) };
  const controller = loadController('../src/controllers/lichKhamBenh.controller.js', {
    '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'Int' } },
    '../utils/response': response,
    '../socket': { emitToAdmin() {}, emitToUser() {} },
    '../middlewares/mobile-scope.middleware': { scopedWhere: () => '', targetElderlyId: () => true },
  });
  const res = {};
  await controller.recordResult({ params: { id: '2' }, body: { ketQuaKham: 'Đã khám' } },
    res, (error) => { throw error; });
  assert.equal(res.status, 422);
  assert.equal(res.errorCode, 'FUTURE_APPOINTMENT');
  assert.equal(writes, 0);
});

test('Rescheduling keeps ChuaDen and notifies the other assigned account', async () => {
  const vietnamDay = (days) => new Date(Date.now()+7*3600000+days*86400000)
    .toISOString().slice(0,10);
  const originalDay = vietnamDay(2);
  const newDay = vietnamDay(3);
  const emitted = [];
  let queries = 0;
  let updateSql = '';
  const pool = { request: () => ({ input() { return this; }, async query(statement) {
    queries++;
    if (queries === 1) return { recordset: [{ elderlyId: 2, ngayKham: originalDay,
      thoiGianKham: `${originalDay}T08:00`, originalTime: `${originalDay}T08:00:00`, trangThai: 'ChuaDen' }] };
    if (queries === 2) {
      updateSql = statement;
      return { recordset: [{ affectedRows: 1 }],
        recordsets: [[{ affectedRows: 1 }], [{ id: 14, userId: 5 }]] };
    }
    return { recordset: [{ elderlyId: 2, userId: 5 }] };
  } }) };
  const controller = loadController('../src/controllers/lichKhamBenh.controller.js', {
    '../config/db': { poolPromise: Promise.resolve(pool), sql: {
      Int: 'Int', Bit: 'Bit', DateTime2: 'DateTime2', NVarChar: 'NVarChar' } },
    '../utils/response': response,
    '../socket': { emitToAdmin() {}, emitToUser: (...args) => emitted.push(args) },
    '../middlewares/mobile-scope.middleware': { scopedWhere: () => '', targetElderlyId: () => true },
  });
  const res = {};
  await controller.update({ params: { id: '3' }, user: { userId: 4 }, body: {
    nguoiCaoTuoiId: 2, ngayKham: newDay, gioKham: '09:00', noiKham: 'Phòng khám A',
  } }, res, (error) => { throw error; });
  assert.equal(res.status, 200);
  assert.match(updateSql, /TrangThai=CASE WHEN @changedTime=1 THEN N'ChuaDen'/);
  assert.match(updateSql, /INSERT INTO ThongBao/);
  assert.ok(emitted.some(([userId, event]) => userId === 5 && event === 'thongbao:new'));
  assert.ok(emitted.some(([userId, event]) => userId === 5 && event === 'lichkham:updated'));
});
