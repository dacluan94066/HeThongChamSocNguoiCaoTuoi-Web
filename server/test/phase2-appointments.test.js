const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const clock = '2026-10-28T08:00:00Z'; // 15:00 Vietnam
function fixture(now = clock) {
  const writes = [], queries = [];
  const pool = { request: () => ({ input() { return this; }, async query(statement) {
    queries.push(statement); if (statement.includes('INSERT INTO LichKhamBenh')) writes.push(statement);
    return { recordset: [{ id: 1 }] };
  } }) };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return Date.parse(now); }
  }
  const filename = path.resolve(__dirname, '../src/controllers/lichKhamBenh.controller.js'), module = { exports: {} }, local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, Date: ClockDate, console,
    require: name => ({ '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'Int', NVarChar: 'String', DateTime2: 'DateTime2' } },
      '../utils/vietnamDate': { todayVietnam: () => new Date(Date.parse(now) + 7 * 3600000).toISOString().slice(0, 10) },
      '../socket': { emitToAdmin() {}, emitToUser() {} },
      '../middlewares/mobile-scope.middleware': { targetElderlyId: () => 1, scopedWhere: () => '' },
    }[name] || local(name)),
  }, { filename });
  const create = async (day, time) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await module.exports.create({ user: { userId: 1 }, body: { nguoiCaoTuoiId: 1, ngayKham: day, gioKham: time, noiKham: 'Cơ sở giả' } }, res, error => { throw error; });
    return res;
  };
  return { create, writes, queries };
}

test('AUD-08 rejects earlier/exact-minute appointment today before SQL; tomorrow early time remains valid', async () => {
  for (const time of ['08:00', '15:00']) {
    const f = fixture(), res = await f.create('2026-10-28', time);
    assert.equal(res.statusCode, 422); assert.equal(res.body.errorCode, 'PAST_APPOINTMENT_TIME'); assert.equal(f.queries.length, 0);
  }
  for (const [day, time] of [['2026-10-28', '15:01'], ['2026-10-29', '08:00']]) {
    const f = fixture(); assert.equal((await f.create(day, time)).statusCode, 201); assert.equal(f.writes.length, 1);
  }
});

test('AUD-08 Vietnam midnight, invalid date and previous-day behavior stay explicit', async () => {
  const late = '2026-10-28T16:59:59Z';
  assert.equal((await fixture(late).create('2026-10-28', '23:59')).statusCode, 422);
  assert.equal((await fixture(late).create('2026-10-29', '00:00')).statusCode, 201);
  assert.equal((await fixture().create('2026-10-27', '23:59')).statusCode, 400);
  assert.equal((await fixture().create('2026-02-30', '08:00')).statusCode, 400);
});

test('AUD-11 reminder SQL includes both actively monitored profile statuses, never stopped profiles', () => {
  const filename = path.resolve(__dirname, '../src/services/appointmentReminder.service.js'), module = { exports: {} }, local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: name => ({ '../config/db': {}, '../socket': { emitToUser() {} } }[name] || local(name)),
  }, { filename });
  const statement = module.exports.MATERIALIZE_DUE_REMINDERS_SQL;
  assert.match(statement, /hs\.TrangThai IN\s*\(N'DangTheoDoi',\s*N'CanChamSocDacBiet'\)/);
  assert.doesNotMatch(statement, /N'NgungTheoDoi'/);
  assert.match(statement, /lk\.TrangThai=N'ChuaDen'/); assert.match(statement, /lk\.ThoiGianKham > @now/);
});

test('Appointment creation and update serialize checks with UPDLOCK, HOLDLOCK and detect same-minute conflicts', async () => {
  const queries = [];
  const pool = { request: () => ({ input() { return this; }, async query(statement) {
    queries.push(statement);
    if (statement.includes('IF EXISTS') && statement.includes('SELECT -1 AS id, \'CONFLICT\'')) {
      return { recordset: [{ id: -1, reason: 'CONFLICT' }] };
    }
    return { recordset: [{ id: 99 }] };
  } }) };

  const filename = path.resolve(__dirname, '../src/controllers/lichKhamBenh.controller.js'), module = { exports: {} }, local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: name => ({ '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'Int', NVarChar: 'String', DateTime2: 'DateTime2', Bit: 'Bit', VarChar: 'VarChar' } },
      '../utils/vietnamDate': { todayVietnam: () => '2026-10-28' },
      '../socket': { emitToAdmin() {}, emitToUser() {} },
      '../middlewares/mobile-scope.middleware': { targetElderlyId: () => 1, scopedWhere: () => '' },
    }[name] || local(name)),
  }, { filename });

  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await module.exports.create({ user: { userId: 1 }, body: { nguoiCaoTuoiId: 1, ngayKham: '2026-10-30', gioKham: '09:00', noiKham: 'BV Chợ Rẫy' } }, res, error => { throw error; });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.errorCode, 'APPOINTMENT_CONFLICT');
  assert.match(queries[0], /WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(queries[0], /TrangThai<>N'Huy'/);
  assert.match(queries[0], /@minuteStart/);
  assert.match(queries[0], /@minuteEnd/);
});
