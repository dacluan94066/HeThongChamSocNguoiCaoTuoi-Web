const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Actual controller with RAM SQL double; no database/network/environment loaded.
function fixture({ status = 'ChuaDenGio', scheduleDate = '2026-10-27', scheduledTime, concurrent = false } = {}) {
  let reads = 0, writes = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const dose = { id: 1, nguoiCaoTuoiId: 42, trangThai: status, thoiGianThucTe: status === 'DaUong' ? '2026-10-27T12:00:00' : null };
  const events = [], times = ['2026-10-27T13:05:00', '2026-10-27T13:05:01'];
  const pool = { request() { const params = {}; return { input(name, type, value) { params[name] = value; return this; }, async query(query) {
    if (query.includes('AS ownerUserId')) {
      const previousStatus = dose.trangThai;
      if (++reads === 2) release(); if (concurrent) await barrier;
      return { recordset: [{ ownerUserId: 7, scheduleDate, scheduledTime, previousStatus }] };
    }
    assert.match(query, /UPDATE LichUongThuoc/);
    const where = query.slice(query.indexOf('WHERE LichUongThuocID=@id'), query.indexOf('DECLARE @affectedRows'));
    assert.match(where, /TrangThai<>N'DaUong'/); assert.match(where, /TrangThai<>@trangThai/);
    assert.match(where, /TrangThai=@previousStatus/);
    assert.match(query, /@@ROWCOUNT/); assert.match(query, /@affectedRows>0/);
    if (dose.trangThai !== params.previousStatus || dose.trangThai === 'DaUong' || dose.trangThai === params.trangThai) return { recordset: [], rowsAffected: [0] };
    dose.trangThai = params.trangThai; dose.thoiGianThucTe = params.trangThai === 'DaUong' ? times[writes] : null; writes++;
    return { recordset: [{ ...dose }], rowsAffected: [1] };
  } }; } };
  const module = { exports: {} };
  const dependencies = {
    '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'int', NVarChar: () => 'nvarchar' } },
    '../utils/response': { ok: (res, data) => Object.assign(res, { status: 200, data }), fail: (res, message, errorCode, status) => Object.assign(res, { status, errorCode, message }) },
    '../middlewares/mobile-scope.middleware': {}, '../socket': { emitToAdmin: (...args) => events.push(args), emitToUser: (...args) => events.push(args) },
    '../utils/vietnamDate': { todayVietnam: () => '2026-10-27' }, '../utils/medicationSupplement': {},
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/controllers/lichUongThuoc.controller.js'), 'utf8'),
    { module, exports: module.exports, require: name => { if (!dependencies[name]) throw Error(name); return dependencies[name]; } });
  return { dose, events, writes: () => writes, async confirm(trangThai = 'DaUong', userId = 7) {
    const res = {}; await module.exports.confirmMine({ params: { id: '1' }, body: { trangThai }, user: { userId } }, res, error => { throw error; }); return res;
  } };
}
test('concurrent Web/Mobile: one succeeds, one conflicts; actual time preserved', async () => {
  const f = fixture({ concurrent: true }); const results = await Promise.all([f.confirm(), f.confirm()]);
  assert.deepEqual(results.map(res => res.status).sort(), [200, 409]);
  assert.equal(results.find(res => res.status === 409).errorCode, 'DOSE_CHANGED');
  assert.equal(f.writes(), 1); assert.equal(f.dose.thoiGianThucTe, '2026-10-27T13:05:00'); assert.equal(f.events.length, 2);
});
test('repeated confirmation or mark taken dose missed never overwrites its time', async () => {
  const f = fixture({ status: 'DaUong' });
  for (const status of ['DaUong', 'BoLo', 'TuChoi']) assert.equal((await f.confirm(status)).status, 409);
  assert.equal(f.dose.thoiGianThucTe, '2026-10-27T12:00:00'); assert.equal(f.writes(), 0); assert.equal(f.events.length, 0);
});
test('same-day missed late confirmation allowed; duplicate missed conflicts', async () => {
  const f = fixture({ status: 'BoLo' }); assert.equal((await f.confirm('BoLo')).status, 409);
  assert.equal((await f.confirm()).status, 200); assert.equal(f.writes(), 1);
});
test('competing missed/taken requests share the same observed state: only one writes', async () => {
  const f = fixture({ concurrent: true });
  assert.deepEqual((await Promise.all([f.confirm('BoLo'), f.confirm('DaUong')])).map(row => row.status).sort(), [200, 409]);
  assert.equal(f.writes(), 1);
});
test('past-day, foreign owner and invalid status blocked before mutation', async () => {
  assert.equal((await fixture({ scheduleDate: '2026-10-26' }).confirm()).status, 422);
  const f = fixture(); assert.equal((await f.confirm('DaUong', 8)).status, 403);
  assert.equal((await f.confirm('Bogus')).status, 422); assert.equal(f.writes(), 0);
});
test('confirm earlier than 30 minutes before scheduled time is blocked with 422 TOO_EARLY', async () => {
  const futureTime = new Date(Date.now() + 2 * 3600000 + 7 * 3600000).toISOString().slice(0, 19);
  const f = fixture({ scheduleDate: '2026-10-27', scheduledTime: futureTime });
  const res = await f.confirm('DaUong');
  assert.equal(res.status, 422);
  assert.equal(res.errorCode, 'TOO_EARLY');
  assert.equal(f.writes(), 0);
});
