const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture({ duplicate = false, assignedCaregiver = true, commitFails = false,
  notificationFails = false } = {}) {
  const writes = [];
  const events = [];
  const state = { notificationId: 0, committed: 0, rolledBack: 0 };
  class Transaction {
    async begin() {}
    async commit() { if (commitFails) throw new Error('COMMIT_FAILED'); state.committed++; }
    async rollback() { state.rolledBack++; }
  }
  class Request {
    input(name, _, value) { this[name] = value; return this; }
    async query(query) {
      if (query.includes(' AS ready')) return { recordset: [{ ready: 0 }] }; // Legacy unpatched schema.
      if (query.includes('FROM HoSoNguoiCaoTuoi WHERE UserID')) {
        return { recordset: [{ id: 7, name: 'Người cao tuổi thử nghiệm' }] };
      }
      if (query.includes('FROM CanhBaoKhanCap sos WITH')) {
        return { recordset: duplicate ? [{ id: 101, canhBaoId: 201,
          soNguoiChamSocNhan: 1, ngayGui: '2026-10-19T10:00:00' }] : [] };
      }
      if (query.includes('INSERT INTO CanhBaoKhanCap')) {
        writes.push({ table: 'sos', viDo: this.viDo, kinhDo: this.kinhDo, noiDung: this.noiDung });
        return { recordset: [{ id: 101, ngayGui: '2026-10-19T10:00:00',
          trangThai: 'DangGui', viDo: this.viDo, kinhDo: this.kinhDo }] };
      }
      if (query.includes('INSERT INTO CanhBao (')) {
        writes.push({ table: 'alert' });
        return { recordset: [{ id: 201 }] };
      }
      if (query.includes('SELECT DISTINCT nd.UserID AS userId')) {
        return { recordset: [
          ...(assignedCaregiver ? [{ userId: 2, role: 'NguoiChamSoc' }] : []),
          { userId: 1, role: 'QuanTriVien' },
        ] };
      }
      if (query.includes('INSERT INTO ThongBao(')) {
        if (notificationFails) throw new Error('NOTIFICATION_FAILED');
        writes.push({ table: 'notification', userId: this.userId,
          content: this.content, source: this.source });
        return { recordset: [{ id: ++state.notificationId }] };
      }
      throw new Error(`Unexpected query: ${query.slice(0, 70)}`);
    }
  }
  const sql = { Int: 'int', NVarChar: () => 'nvarchar', Decimal: () => 'decimal',
    Transaction, Request, ISOLATION_LEVEL: { SERIALIZABLE: 'serializable' } };
  const db = { sql, poolPromise: Promise.resolve({ request: () => new Request() }) };
  const socket = {
    emitToAdminOnly: () => { throw new Error('SOS must not broadcast to a cached admin room'); },
    emitToUser: (userId, event, data) => {
      assert.equal(state.committed, 1, 'No realtime event before successful commit');
      events.push({ recipient: userId, event, data });
    },
  };
  const load = (file, dependencies) => {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
      module, exports: module.exports,
      require: (name) => dependencies[name] || require(name),
      console,
    }, { filename: file });
    return module.exports;
  };
  const notifications = load('../src/services/alertNotification.service.js', {
    '../config/db': db, '../socket': socket,
    './relativeRealtime.service': require('../src/services/relativeRealtime.service'),
  });
  const controller = load('../src/controllers/emergencyAlert.controller.js', {
    '../config/db': db,
    '../utils/alertTime': require('../src/utils/alertTime'),
    '../utils/response': {
      ok: (res, data, _, status = 200) => { res.code = status; res.data = data; return data; },
      fail: (res, message, code, status) => { res.code = status; res.error = code; res.message = message; },
    },
    '../middlewares/mobile-scope.middleware': { scopedWhere: () => '' },
    '../services/alertNotification.service': notifications,
    '../services/alertWorkflow.service': { endpoint: () => () => {} },
  });
  const send = async (body) => {
    const res = {};
    let failed;
    await controller.create({ user: { userId: 3, tenVaiTro: 'NguoiCaoTuoi' }, body }, res,
      (error) => { failed = error; });
    await new Promise((resolve) => setImmediate(resolve));
    if (failed) throw failed;
    return res;
  };
  return { send, writes, events, state };
}

test('SOS with GPS notifies only assigned caregiver and admin with Maps link', async () => {
  const { send, writes, events } = fixture();
  const result = await send({ viDo: 10.75, kinhDo: 106.67 });
  assert.equal(result.code, 201);
  assert.equal(result.data.soNguoiChamSocNhan, 1);
  assert.equal(result.data.trungLap, false);
  assert.equal(writes.filter((item) => item.table === 'notification').length, 2);
  assert.deepEqual(writes.filter((item) => item.table === 'notification').map((item) => item.userId), [2, 1]);
  assert.ok(writes.every((item) => item.table !== 'notification' ||
    item.content.includes('https://www.google.com/maps?q=10.75,106.67')));
  assert.deepEqual(events.filter((item) => item.event === 'canhbao:new').map((item) => item.recipient), [1, 2]);
  assert.equal(events.find((item) => item.event === 'canhbao:new').data.canhBaoKhanCapId, 101);
});

test('SOS without GPS still creates both alerts and notifications', async () => {
  const { send, writes } = fixture();
  const result = await send({});
  assert.equal(result.code, 201);
  assert.equal(writes.find((item) => item.table === 'sos').noiDung, 'Cảnh báo SOS khẩn cấp');
  assert.equal(writes.find((item) => item.table === 'sos').viDo, null);
  assert.equal(writes.filter((item) => item.table === 'notification').length, 2);
  assert.ok(writes.every((item) => item.table !== 'notification' || !item.content.includes('google.com/maps')));
});

test('SOS without assigned caregiver still reaches admin and reports zero caregivers', async () => {
  const { send, writes, events } = fixture({ assignedCaregiver: false });
  const result = await send({});
  assert.equal(result.code, 201);
  assert.equal(result.data.soNguoiChamSocNhan, 0);
  assert.deepEqual(writes.filter((item) => item.table === 'notification').map((item) => item.userId), [1]);
  assert.deepEqual(events.filter((item) => item.event === 'canhbao:new').map((item) => item.recipient), [1]);
});

test('Invalid or incomplete coordinates are rejected without writes', async () => {
  const { send, writes } = fixture();
  for (const body of [{ viDo: 91, kinhDo: 10 }, { viDo: 10 }, { viDo: 0, kinhDo: -181 }]) {
    const result = await send(body);
    assert.equal(result.code, 400);
    assert.equal(result.error, 'INVALID_COORDINATES');
  }
  assert.equal(writes.length, 0);
});

test('Second SOS inside 30 seconds returns existing alert and emits nothing', async () => {
  const { send, writes, events } = fixture({ duplicate: true });
  const result = await send({});
  assert.equal(result.code, 200);
  assert.equal(result.data.trungLap, true);
  assert.equal(result.data.soNguoiChamSocNhan, 1);
  assert.equal(writes.length, 0);
  assert.equal(events.length, 0);
});

for (const failure of ['commitFails', 'notificationFails']) {
  test(`SOS ${failure} rolls back and never emits success/realtime`, async () => {
    const { send, events, state } = fixture({ [failure]: true });
    await assert.rejects(send({}), /FAILED/);
    assert.equal(state.committed, 0);
    assert.equal(state.rolledBack, 1);
    assert.equal(events.length, 0);
  });
}
