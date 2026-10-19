const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function load(relative, stubs) {
  const filename = path.resolve(__dirname, relative);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    exports: module.exports,
    require: (id) => stubs[id] ?? createRequire(filename)(id),
    console,
    setImmediate,
    setInterval,
    clearInterval,
  }, { filename });
  return module.exports;
}

test('materializer uses Vietnam time, two exclusive windows and an idempotent fingerprint', async () => {
  let query = '';
  const pool = { request: () => ({ query: async (sql) => {
    query = sql;
    return { recordset: [{ id: 7, userId: 2 }] };
  } }) };
  const service = load('../src/services/appointmentReminder.service.js', {
    '../config/db': { poolPromise: Promise.resolve(pool) },
    '../socket': { emitToUser: () => true },
  });
  assert.deepEqual(await service.materializeDueAppointmentReminders(pool), [{ id: 7, userId: 2 }]);
  assert.match(query, /DATEADD\(HOUR, 7, SYSUTCDATETIME\(\)\)/);
  assert.match(query, /N'24h', 24, DATEADD\(HOUR, -24/);
  assert.match(query, /N'2h',\s+2, DATEADD\(HOUR,\s+-2/);
  assert.match(query, /lk\.TrangThai=N'ChuaDen'/);
  assert.match(query, /lk\.ThoiGianKham > @now/);
  assert.match(query, /NOT EXISTS/);
  assert.match(query, /existing\.LienKetBang=due\.linkTable/);
  assert.match(query, /N'NhacLichKham'/);
});

test('notifications endpoint materializes due reminders before reading the list', async () => {
  const calls = [];
  const pool = { request: () => {
    const input = {};
    return {
      input(key, _type, value) { input[key] = value; return this; },
      async query(sql) { calls.push({ sql, input }); return { recordset: [] }; },
    };
  } };
  const controller = load('../src/controllers/notification.controller.js', {
    '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'Int' } },
    '../services/appointmentReminder.service': {
      materializeDueAppointmentReminders: async (received) => {
        assert.equal(received, pool);
        calls.push({ sql: 'MATERIALIZE' });
      },
    },
    '../services/medicationReminder.service': {
      materializeDueMedicationReminders: async (received) => {
        assert.equal(received, pool);
        calls.push({ sql: 'MATERIALIZE_MEDICATION' });
      },
    },
    '../utils/response': {
      ok: (_res, data) => data,
      fail: () => { throw new Error('unexpected fail'); },
    },
  });
  await controller.getMine({ user: { userId: 9 } }, {}, (error) => { throw error; });
  assert.equal(calls[0].sql, 'MATERIALIZE');
  assert.equal(calls[1].sql, 'MATERIALIZE_MEDICATION');
  assert.match(calls[2].sql, /FROM ThongBao/);
  assert.equal(calls[2].input.userId, 9);
});

test('appointment changes remove only unread appointment reminders', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/controllers/lichKhamBenh.controller.js'),
    'utf8',
  );
  const cleanup = /DELETE FROM ThongBao[\s\S]*?LoaiThongBao=N'NhacLichKham'[\s\S]*?LienKetBang LIKE N'LichKhamBenh:%'[\s\S]*?DaDoc=0/g;
  assert.equal((source.match(cleanup) || []).length, 3);
  assert.match(source, /UPDATE LichKhamBenh SET[\s\S]*?DELETE FROM ThongBao/);
  assert.match(source, /SET TrangThai=N'Huy'[\s\S]*?DELETE FROM ThongBao/);
  assert.match(source, /SET KetQuaKham=@result, TrangThai=N'DaKham'[\s\S]*?DELETE FROM ThongBao/);
});
