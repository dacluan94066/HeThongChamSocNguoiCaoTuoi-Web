const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { validateSupplement, supplementEligibility, attachSupplementHistory } = require('../src/utils/medicationSupplement');

const NOW = new Date('2026-10-23T05:30:00Z');
const DOSE = { id: 7, nguoiCaoTuoiId: 9, ownerUserId: 11, trangThai: 'BoLo',
  thoiGianDuKien: '2026-10-22T21:40:00', serverNow: '2026-10-23T12:30:00', canAccess: 1, auditAvailable: 1 };
const BODY = { thoiGianThucTe: '2026-10-22T21:45:00+07:00', lyDo: 'Đã uống nhưng quên xác nhận' };
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW.getTime(); } }

function load(relative, stubs) {
  const filename = path.resolve(__dirname, relative);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, Date: FixedDate, console,
    require: (name) => stubs[name] ?? createRequire(filename)(name),
  }, { filename });
  return module.exports;
}

test('supplement validates an explicit actual time and trimmed reason, not a client status', () => {
  assert.deepEqual(validateSupplement(BODY, NOW), { takenAt: '2026-10-22T21:45:00', reason: BODY.lyDo });
  assert.deepEqual(validateSupplement({ ...BODY, thoiGianThucTe: '2026-10-22T14:45:00Z' }, NOW), validateSupplement(BODY, NOW));
  for (const value of [null, '', 1, {}, '2026-02-30T08:00:00+07:00', '2026-10-22T24:00:00+07:00',
    '2026-10-22T08:61:00+07:00', '2026-10-22T08:00:61+07:00', '2026-10-22T08:00:00',
    '2026-10-23T12:31:00+07:00', 'tomorrow']) {
    assert.ok(validateSupplement({ ...BODY, thoiGianThucTe: value }, NOW).error, String(value));
  }
  for (const lyDo of [null, {}, '', '    ', '1234', 'X'.repeat(301)]) {
    assert.ok(validateSupplement({ ...BODY, lyDo }, NOW).error);
  }
});

test('48-hour cutoff is exact and independent of server/device timezone', () => {
  const check = (changes, takenAt = '2026-10-22T21:45:00') => supplementEligibility({ ...DOSE, ...changes }, takenAt);
  assert.equal(check({}), null);
  assert.equal(check({ trangThai: 'ChuaDenGio' }), null);
  assert.equal(check({ thoiGianDuKien: '2026-10-21T12:30:00' }), null);
  assert.equal(check({ thoiGianDuKien: '2026-10-21T12:29:59' }).code, 'SUPPLEMENT_WINDOW_EXPIRED');
  assert.equal(check({ thoiGianDuKien: '2026-10-23T01:00:00' }).code, 'NOT_PAST_DOSE');
  assert.equal(check({ thoiGianDuKien: '2026-10-24T01:00:00' }).code, 'NOT_PAST_DOSE');
  assert.equal(check({}, '2026-10-21T23:59:59').code, 'INVALID_TAKEN_TIME');
  assert.equal(check({}, '2026-10-23T12:30:01').code, 'INVALID_TAKEN_TIME');
  for (const trangThai of ['DaUong', 'TuChoi', 'unknown']) assert.equal(check({ trangThai }).status, 409);
  assert.equal(check({ canAccess: 0 }).status, 403);
});

function fixture({ dose = { ...DOSE }, duplicate = false, writeFails = false, socketFails = false } = {}) {
  const queries = [], events = [], audits = [];
  let committed = 0, rolledBack = 0, writes = 0;
  let lock = Promise.resolve();
  const state = { dose, writes: () => writes, committed: () => committed, rolledBack: () => rolledBack, queries, events, audits };
  class Transaction {
    async begin() {
      const previous = lock;
      lock = new Promise((resolve) => { this.release = resolve; });
      await previous;
    }
    async commit() { committed++; this.release(); }
    async rollback() { rolledBack++; this.release(); }
  }
  class Request {
    constructor() { this.values = {}; }
    input(name, _type, value) { this.values[name] = value; return this; }
    async query(statement) {
      queries.push(statement);
      if (statement.includes('INSERT INTO dbo.LichSuGhiNhanUongThuoc')) {
        writes++;
        if (duplicate) throw Object.assign(new Error('duplicate'), { number: 2627 });
        if (writeFails) throw new Error('audit unavailable');
        audits.push({ oldStatus: state.dose.trangThai, ...this.values });
        state.dose = { ...state.dose, trangThai: 'DaUong' };
        return { recordset: [{ ...state.dose, thoiGianThucTe: this.values.takenAt,
          ngayGhiNhan: state.dose.serverNow, trangThaiCu: audits[0].oldStatus,
          nguoiGhiNhanTen: 'Người kiểm thử', vaiTro: this.values.role, lyDo: this.values.reason }] };
      }
      return { recordset: state.dose ? [state.dose] : [] };
    }
  }
  const emit = (...args) => { if (socketFails) throw new Error('socket offline'); events.push(args); };
  const controller = load('../src/controllers/medicationSupplement.controller.js', {
    '../config/db': { poolPromise: Promise.resolve({}), sql: { Transaction, Request, ISOLATION_LEVEL: { SERIALIZABLE: 4 }, Int: 'Int', NVarChar: () => '', VarChar: () => '' } },
    '../utils/medicationSupplement': { supplementEligibility, validateSupplement: (body) => validateSupplement(body, NOW) },
    '../utils/response': { ok: (res, data) => Object.assign(res, { status: 200, data }),
      fail: (res, message, code, status) => Object.assign(res, { status, code, message }) },
    '../socket': { emitToAdmin: emit, emitToUser: emit },
  });
  state.call = async (changes = {}) => {
    const res = {};
    await controller.supplement({ params: { id: '7' }, body: BODY,
      user: { userId: 11, tenVaiTro: 'NguoiCaoTuoi' }, ...changes }, res,
    (error) => { res.error = error; });
    return res;
  };
  return state;
}

for (const role of ['NguoiCaoTuoi', 'NguoiChamSoc', 'QuanTriVien']) {
  test(`${role}: authorized supplement atomically stores audit and actual time, emits after commit`, async () => {
    const f = fixture();
    const res = await f.call({ user: { userId: 11, tenVaiTro: role } });
    assert.equal(res.status, 200);
    assert.equal(f.committed(), 1); assert.equal(f.rolledBack(), 0);
    assert.equal(f.audits[0].oldStatus, 'BoLo');
    assert.equal(f.audits[0].takenAt, '2026-10-22T21:45:00');
    assert.equal(f.audits[0].recordedAt, '2026-10-23T12:30:00');
    assert.equal(res.data.ghiNhanBoSung.lyDo, BODY.lyDo);
    assert.equal(f.events.length, 2);
    assert.match(f.queries[0], /UPDLOCK,HOLDLOCK/);
    assert.match(f.queries[0], /nct.UserID=@actor/);
    assert.match(f.queries[0], /ncs.UserID=@actor/);
    assert.match(f.queries[0], /lk.NgayKetThuc>CAST/);
    assert.match(f.queries[1], /ThoiGianThucTeCu/);
    assert.match(f.queries[1], /UPDATE ThongBao SET DaDoc=1/);
    assert.doesNotMatch(f.queries[1], /DELETE FROM CanhBao|INSERT INTO ThongBao|INSERT INTO LichUongThuoc/);
  });
}
for (const changes of [{ canAccess: 0 }, { trangThai: 'DaUong' }, { trangThai: 'TuChoi' },
  { thoiGianDuKien: '2026-10-20T21:40:00' }, { auditAvailable: 0 }]) {
  test(`blocked case has no mutation/events: ${JSON.stringify(changes)}`, async () => {
    const f = fixture({ dose: { ...DOSE, ...changes } });
    const res = await f.call();
    assert.ok([403, 409, 422, 503].includes(res.status));
    assert.equal(f.writes(), 0); assert.equal(f.events.length, 0); assert.equal(f.rolledBack(), 1);
  });
}
test('invalid fields/role/id never begin a transaction', async () => {
  for (const changes of [{ params: { id: 'bad' } }, { body: { ...BODY, lyDo: '' } },
    { user: { userId: 11, tenVaiTro: 'BacSi' } }]) {
    const f = fixture(); const res = await f.call(changes);
    assert.ok([400, 403, 422].includes(res.status)); assert.equal(f.queries.length, 0);
  }
});
test('duplicate and audit failure rollback without emitting apparent success', async () => {
  for (const options of [{ duplicate: true }, { writeFails: true }]) {
    const f = fixture(options); const res = await f.call();
    assert.equal(f.committed(), 0); assert.equal(f.rolledBack(), 1); assert.equal(f.events.length, 0);
    assert.ok(res.status === 409 || res.error);
  }
});
test('two concurrent devices produce exactly one audit and one successful update', async () => {
  const f = fixture(); const results = await Promise.all([f.call(), f.call()]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(f.audits.length, 1); assert.equal(f.writes(), 1); assert.equal(f.committed(), 1);
});
test('socket outage does not turn a committed supplement into failure', async () => {
  const f = fixture({ socketFails: true }); const res = await f.call();
  assert.equal(res.status, 200); assert.equal(f.committed(), 1); assert.equal(f.rolledBack(), 0);
});
test('history enrichment retains notes and returns exact API metadata, absent patch is safe', async () => {
  for (const installed of [false, true]) {
    let statement;
    const pool = { request: () => ({ async query(query) { statement = query; return { recordset: installed
      ? [{ id: 7, ngayGhiNhan: '2026-10-23T12:30:00', lyDo: BODY.lyDo }] : [] }; } }) };
    const rows = await attachSupplementHistory(pool, [{ id: 7, ghiChu: 'Giữ nguyên ghi chú' }]);
    assert.equal(rows[0].ghiChu, 'Giữ nguyên ghi chú');
    assert.equal(rows[0].ghiNhanBoSung?.lyDo ?? null, installed ? BODY.lyDo : null);
    assert.match(statement, /IF OBJECT_ID/); assert.match(statement, /IN \(7\)/);
  }
});
test('route is feature-permission protected and audit patch is idempotent, no patient updates', () => {
  const route = fs.readFileSync(path.resolve(__dirname, '../src/routes/medicationSchedule.routes.js'), 'utf8');
  assert.match(route, /router.patch\('\/:id\/supplement', checkPermission\('QLLICHUONGTHUOC','sua'\), supplement\)/);
  const patch = fs.readFileSync(path.resolve(__dirname, '../database/patch_medication_supplement.sql'), 'utf8');
  assert.match(patch, /IF OBJECT_ID/); assert.match(patch, /UNIQUE\(LichUongThuocID\)/);
  assert.doesNotMatch(patch, /UPDATE LichUongThuoc|DELETE FROM|DROP TABLE/);
  const final = fs.readFileSync(path.resolve(__dirname, '../../QLSucKhoeNguoiCaoTuoi_FINAL.sql'), 'utf8');
  assert.ok(final.replace(/\r/g, '').includes(patch.trim().replace(/\r/g, '')));
});
test('report splits actual timing from recording time, scoped by scheduled date', async () => {
  let last;
  const pool = { request: () => ({ input() { return this; }, async query(statement) {
    last = statement;
    return { recordset: statement.includes('AS khongSauGioDuKien') ? [{ khongSauGioDuKien: 2, sauGioDuKien: 1,
      chuaRoGioUong: 1, ghiNhanBoSung: 2 }] : [] };
  } }) };
  const controller = load('../src/controllers/report.controller.js', {
    '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: '', VarChar: () => '', NVarChar: () => '' } },
    '../utils/response': { ok: (res, data) => Object.assign(res, { data }) },
  });
  const res = {};
  await controller.getHealthSummary({ query: { from: '2026-10-22', to: '2026-10-23' },
    user: { userId: 11, tenVaiTro: 'NguoiChamSoc' } }, res, (error) => { throw error; });
  assert.equal(res.data.ghiNhanUongThuoc.ghiNhanBoSung, 2);
  assert.equal(res.data.ghiNhanUongThuoc.khongSauGioDuKien, 2);
  assert.match(last, /lut.ThoiGianThucTe>lut.ThoiGianDuKien/);
  assert.match(last, /scopeCaregiver.UserID=@caregiverUserId/);
  assert.match(last, /lut.ThoiGianDuKien>=CAST\(@fromDate AS DATE\)/);
  assert.doesNotMatch(last, /NgayGhiNhan>=/);
});
