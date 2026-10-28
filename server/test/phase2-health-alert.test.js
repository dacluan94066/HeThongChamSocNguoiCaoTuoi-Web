const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function fixture() {
  const notifications = [], queries = [];
  const measured = '2026-10-27T06:05:00Z', created = '2026-10-28T08:00:00Z';
  const request = () => ({ input() { return this; }, async query(statement) {
    queries.push(statement);
    if (statement.includes('FROM LoaiChiSoSucKhoe') && !statement.includes('INSERT')) return { recordset: [{
      LoaiChiSoID: 7, TenChiSo: 'Nhịp tim', DonVi: 'lần/phút', GiaTriMin: 60, GiaTriMax: 100,
    }] };
    if (statement.includes('WHERE UserID = @userId')) return { recordset: [{ id: 3 }] };
    if (statement.includes('SELECT HoTen AS name')) return { recordset: [{ name: 'NCT fixture' }] };
    return { recordset: [{ id: 11, alertId: 12, tenChiSo: 'Nhịp tim', giaTri: 150,
      thoiGianDo: new Date(measured), thoiGianDoUtc: measured, alertCreatedAt: created }] };
  } });
  const filename = path.resolve(__dirname, '../src/controllers/chiSoSucKhoe.controller.js'), module = { exports: {} }, local = createRequire(filename);
  class ClockDate extends Date { static now() { return Date.parse(created); } }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, Date: ClockDate, console,
    require: name => ({ '../config/db': { poolPromise: Promise.resolve({ request }), sql: { Int: 'Int', NVarChar: () => 'String', Decimal: () => 'Decimal', Bit: 'Bit', DateTime2: 'DateTime2' } },
      '../middlewares/mobile-scope.middleware': { targetElderlyId: () => 3, isMobileRole: () => false },
      '../socket': { emitToAdmin() {} },
      '../services/alertNotification.service': { notifyAlertRecipients: async () => ({}), emitAlertNotifications: (_delivery, payload) => notifications.push(payload) },
    }[name] || local(name)),
  }, { filename });
  return { notifications, queries, measured, created, async call(handler) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await module.exports[handler]({ user: { userId: 1 }, body: { nguoiCaoTuoiId: 3,
      loaiChiSo: 'NHIP_TIM', loaiChiSoId: 7, giaTri: 150, ngayDo: '2026-10-27', gioDo: '13:05' } }, res, error => { throw error; });
    return res;
  } };
}

for (const handler of ['create', 'createMine']) test(`AUD-14 ${handler}: alert detectedAt is its SQL creation time, measurement time stays separate`, async () => {
  const f = fixture(), res = await f.call(handler);
  assert.equal(res.statusCode, 201); assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0].thoiGianPhatHien, f.created);
  assert.equal(f.notifications[0].thoiGianDo, f.measured);
  assert.ok(f.queries.some(query => query.includes('cb.NgayTao') && query.includes('alertCreatedAt')));
  assert.equal((Date.parse(f.created) - Date.parse(f.notifications[0].thoiGianPhatHien)) / 60000, 0);
});
