const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Real controller, transactional in-memory SQL double. Never imports live DB.
function fixture({ now = '2026-10-28T15:00:00', after = now } = {}) {
  const state = { committed: false, rolledBack: false, doses: [], queries: [], events: [] };
  class Transaction {
    async begin() {}
    async commit() { state.committed = true; }
    async rollback() { state.rolledBack = true; state.doses = []; }
  }
  class Request {
    constructor() { this.values = {}; }
    input(key, _type, value) { this.values[key] = value; return this; }
    async query(query) {
      state.queries.push(query);
      if (query.includes('expiredCount')) return { recordset: [{ expiredCount: state.doses.filter(time => time <= after).length }] };
      if (query.includes('generatedCount')) {
        assert.match(query, /ThoiGianDuKien > DATEADD\(HOUR,7,SYSUTCDATETIME\(\)\)/);
        const times = Object.entries(this.values).filter(([key]) => /^time\d+$/.test(key)).map(([, value]) => value);
        const result = [];
        for (let day = this.values.startDate; day <= this.values.endDate;
          day = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
          for (const time of times) if (`${day}T${time}:00` > now) result.push(`${day}T${time}:00`);
        }
        state.doses.push(...result);
        return { recordset: [{ generatedCount: result.length }] };
      }
      if (query.includes('FROM HoSoNguoiCaoTuoi')) return { recordset: [{ NguoiCaoTuoiID: 7, UserID: 8 }] };
      if (query.includes('FROM DanhMucThuoc')) return { recordset: [{ id: this.values.medicineId, tenThuoc: `THUỐC TEST ${this.values.medicineId}` }] };
      if (query.includes('INSERT INTO DonThuoc')) return { recordset: [{ id: 20 }] };
      throw Error(`Unexpected isolated query: ${query}`);
    }
  }
  const filename = path.resolve(__dirname, '../src/controllers/donThuoc.controller.js');
  const module = { exports: {} }, local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: name => ({
      '../config/db': { poolPromise: Promise.resolve({}), sql: { Int: 1, Date: 2, Transaction, Request, NVarChar: () => 3, VarChar: () => 4 } },
      '../utils/vietnamDate': { todayVietnam: () => now.slice(0, 10) },
      '../socket': { emitToUser: (...args) => state.events.push(args), emitToAdmin: (...args) => state.events.push(args) },
    }[name] || local(name)),
  }, { filename });
  return { state, async create(body) {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await module.exports.create({ params: { id: '7' }, user: { userId: 1 }, body }, response, error => { throw error; });
    return response;
  } };
}
const medicine = (times, id = 1) => ({ thuocId: id, lieuDung: 'LIỀU TEST', soLanMoiNgay: times.length, gioUong: times });
const body = (times, start = '2026-10-28', end = start) => ({ ngayBatDau: start, ngayKetThuc: end, danhSachThuoc: [medicine(times)] });

test('past-only today is 422 and rolls back prescription/details, with no realtime', async () => {
  const f = fixture(), res = await f.create(body(['08:00']));
  assert.equal(res.statusCode, 422); assert.equal(res.body.errorCode, 'NO_FUTURE_DOSES');
  assert.match(res.body.message, /không còn giờ uống hợp lệ/);
  assert.equal(f.state.rolledBack, true); assert.equal(f.state.committed, false);
  assert.equal(f.state.doses.length, 0); assert.equal(f.state.events.length, 0);
});
test('one empty medicine rolls back the entire prescription even if another medicine has a future dose', async () => {
  const f = fixture(), data = body(['20:00']); data.danhSachThuoc.push(medicine(['08:00'], 2));
  assert.equal((await f.create(data)).statusCode, 422);
  assert.equal(f.state.rolledBack, true); assert.equal(f.state.doses.length, 0);
});
test('mixed times skip past occurrence and keep future time; no new historical dose', async () => {
  const f = fixture(), res = await f.create(body(['08:00', '20:00']));
  assert.equal(res.statusCode, 201); assert.equal(res.body.data.soLichDaTao, 1);
  assert.deepEqual(f.state.doses, ['2026-10-28T20:00:00']); assert.equal(f.state.committed, true);
});
test('08:00 tomorrow is valid at 15:00 today; recurrence retains later early hours', async () => {
  const f = fixture();
  assert.equal((await f.create(body(['08:00'], '2026-10-29', '2026-10-30'))).statusCode, 201);
  assert.deepEqual(f.state.doses, ['2026-10-29T08:00:00', '2026-10-30T08:00:00']);
});
test('all past today still starts tomorrow when range includes tomorrow', async () => {
  const f = fixture(), res = await f.create(body(['08:00'], '2026-10-28', '2026-10-29'));
  assert.equal(res.statusCode, 201); assert.equal(res.body.data.soLichDaTao, 1);
  assert.deepEqual(f.state.doses, ['2026-10-29T08:00:00']);
});
test('no end date preserves the existing 30-day generation policy', async () => {
  const f = fixture(), data = body(['08:00']); delete data.ngayKetThuc;
  const res = await f.create(data);
  assert.equal(res.statusCode, 201); assert.equal(res.body.data.soLichDaTao, 29);
  assert.equal(res.body.data.ngayKetThucSinhLich, '2026-11-26');
});
test('invalid ranges, dates, hours and repeated times fail before SQL writes', async () => {
  for (const data of [body(['08:00'], '2026-10-29', '2026-10-28'), body(['25:00']), body(['08:00', '08:00']), body(['08:00'], '2026-02-30')]) {
    const f = fixture(), res = await f.create(data);
    assert.equal(res.statusCode, 400); assert.equal(f.state.queries.length, 0);
  }
});
test('23:59 boundary: today occurrence rejected, tomorrow midnight remains future', async () => {
  const f = fixture({ now: '2026-10-28T23:59:59' });
  assert.equal((await f.create(body(['23:59']))).statusCode, 422);
  const g = fixture({ now: '2026-10-28T23:59:59' });
  assert.equal((await g.create(body(['00:00'], '2026-10-29'))).statusCode, 201);
});
test('clock crossing first dose / midnight during transaction returns 409 and rolls back without emitting', async () => {
  for (const [now, after, data] of [
    ['2026-10-28T19:59:59', '2026-10-28T20:00:00', body(['20:00'])],
    ['2026-10-28T23:59:59', '2026-10-29T00:00:00', body(['00:00'], '2026-10-29')],
  ]) {
    const f = fixture({ now, after }), res = await f.create(data);
    assert.equal(res.statusCode, 409); assert.equal(res.body.errorCode, 'PRESCRIPTION_TIME_CHANGED');
    assert.equal(f.state.rolledBack, true); assert.equal(f.state.committed, false);
    assert.equal(f.state.events.length, 0); assert.equal(f.state.doses.length, 0);
  }
});
