const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Fixed clock + RAM SQL double. Real SQL concurrency is covered separately by
// medication-status-stage6.integration.test.js (explicit opt-in, existing DB).
function fixture({ status = 'ChuaDenGio', date = '2026-10-28', scheduledTime, concurrent = false, exists = true } = {}) {
  const dose = { id: 1, nguoiCaoTuoiId: 42, trangThai: status,
    actual: status === 'DaUong' ? '2026-10-28T08:00:00' : null, actor: status === 'DaUong' ? 7 : null };
  const events = [];
  let reads = 0, writes = 0, reminders = 1, release;
  const gate = new Promise(resolve => { release = resolve; });
  class Clock extends Date { static now() { return Date.parse('2026-10-28T06:05:00Z'); } }
  const pool = { request() { const p = {}; return {
    input(key, _type, value) { p[key] = value; return this; },
    async query(text) {
      if (text.startsWith('SELECT CONVERT')) {
        const snapshot = { scheduleDate: date, scheduledTime, previousStatus: dose.trangThai };
        if (++reads === 2) release();
        if (concurrent) await gate;
        return { recordset: exists ? [snapshot] : [] };
      }
      if (text.includes('SELECT UserID AS userId')) return { recordset: [{ userId: 7 }] };
      assert.match(text, /UPDATE LichUongThuoc/);
      const where = text.slice(text.indexOf('WHERE LichUongThuocID=@id'), text.indexOf('DECLARE @affectedRows'));
      assert.match(where, /TrangThai=@previousStatus/);
      assert.match(where, /TrangThai<>N'DaUong'/);
      assert.match(where, /TrangThai<>@trangThai/);
      assert.match(text, /@@ROWCOUNT/);
      assert.match(text, /DaDoc=0 AND @affectedRows>0/);
      if (dose.trangThai !== p.previousStatus || dose.trangThai === 'DaUong' || dose.trangThai === p.trangThai) {
        return { recordset: [], rowsAffected: [0, 0] };
      }
      dose.trangThai = p.trangThai; dose.actual = p.thoiGianThucTe?.toISOString() ?? null;
      dose.actor = p.nguoiXacNhan; writes++; reminders = 0;
      return { recordset: [{ ...dose }], rowsAffected: [1, 1] };
    },
  }; } };
  const module = { exports: {} }, deps = {
    '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'Int', DateTime2: 'DateTime2', NVarChar: () => 'NVarChar' } },
    '../utils/response': { ok: (res, data) => Object.assign(res, { status: 200, data }),
      fail: (res, message, errorCode, status) => Object.assign(res, { status, errorCode, message }) },
    '../socket': { emitToAdmin: (...args) => events.push(args), emitToUser: (...args) => events.push(args) },
    '../utils/vietnamDate': { todayVietnam: () => '2026-10-28' },
    '../middlewares/mobile-scope.middleware': {}, '../utils/medicationSupplement': {},
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/controllers/lichUongThuoc.controller.js'), 'utf8'),
    { module, exports: module.exports, Date: Clock, require: name => { assert.ok(deps[name], name); return deps[name]; } });
  return { dose, events, reads: () => reads, writes: () => writes, reminders: () => reminders,
    async call(trangThai, userId = 7) {
      const res = {};
      await module.exports.updateStatus({ params: { id: '1' }, body: { trangThai }, user: { userId } }, res, error => { throw error; });
      return res;
    } };
}

test('legacy status: taken dose cannot be repeated or changed to missed/refused', async () => {
  const f = fixture({ status: 'DaUong' }), before = { ...f.dose };
  for (const state of ['DaUong', 'DA_UONG', 'BoLo', 'BO_LO', 'TuChoi', 'TU_CHOI']) {
    const response = await f.call(state, 99);
    assert.equal(response.status, 409); assert.equal(response.errorCode, 'DOSE_CHANGED');
    assert.deepEqual(f.dose, before);
  }
  assert.equal(f.writes(), 0); assert.equal(f.reminders(), 1); assert.equal(f.events.length, 0);
});

for (const states of [['DaUong', 'BoLo'], ['BoLo', 'DaUong'], ['DaUong', 'DaUong'], ['BoLo', 'BoLo']]) {
  test(`legacy status concurrent ${states.join('/')} from same snapshot: one writer`, async () => {
    const f = fixture({ concurrent: true });
    const replies = await Promise.all(states.map((s, i) => f.call(s, 7 + i)));
    assert.deepEqual(replies.map(r => r.status).sort(), [200, 409]);
    const winner = replies.findIndex(r => r.status === 200);
    assert.equal(f.dose.trangThai, states[winner]); assert.equal(f.dose.actor, 7 + winner);
    assert.equal(f.dose.actual, states[winner] === 'DaUong' ? '2026-10-28T13:05:00.000Z' : null);
    assert.equal(f.writes(), 1); assert.equal(f.events.length, 2);
    assert.equal(replies.find(r => r.status === 409).errorCode, 'DOSE_CHANGED');
  });
}

for (const state of ['BoLo', 'TuChoi']) {
  test(`legacy status retains deliberate same-day late confirmation from ${state}`, async () => {
    const f = fixture({ status: state });
    assert.equal((await f.call(state)).status, 409);
    assert.equal((await f.call('DA_UONG')).status, 200);
    assert.equal(f.dose.actual, '2026-10-28T13:05:00.000Z'); assert.equal(f.writes(), 1);
  });
}

test('legacy status preserves success envelope, aliases, actor and realtime payload', async () => {
  for (const [input, state] of [['DA_UONG', 'DaUong'], ['BO_LO', 'BoLo'], ['TU_CHOI', 'TuChoi']]) {
    const f = fixture(); const response = await f.call(input, 99);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(response.data)), { id: 1, nguoiCaoTuoiId: 42, trangThai: input, trangThaiDb: state });
    assert.equal(f.dose.actor, 99); assert.equal(f.events.length, 2); assert.equal(f.reminders(), 0);
  }
});

test('legacy status keeps invalid-state/date/not-found validation before write', async () => {
  const f = fixture();
  for (const state of [undefined, 'ChuaDenGio', 'unknown']) assert.equal((await f.call(state)).status, 422);
  assert.equal(f.reads(), 0); assert.equal(f.writes(), 0);
  for (const date of ['2026-10-27', '2026-10-29']) {
    const old = fixture({ date }); const response = await old.call('DaUong');
    assert.equal(response.status, 422); assert.equal(response.errorCode, 'NOT_TODAY'); assert.equal(old.writes(), 0);
  }
  const missing = fixture({ exists: false }); assert.equal((await missing.call('DaUong')).status, 404);
});

test('updateStatus earlier than 30 minutes before scheduled time is blocked with 422 TOO_EARLY', async () => {
  const f = fixture({ scheduledTime: '2026-10-28T14:00:00' });
  const response = await f.call('DaUong');
  assert.equal(response.status, 422);
  assert.equal(response.errorCode, 'TOO_EARLY');
  assert.equal(f.writes(), 0);
});
