const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');
const { createRequire } = require('node:module');

// This fixture never imports config/db or reads .env. SQL is checked as a
// contract and evaluated against synthetic accounts/assignments only.
const today = '2026-10-23';
const makeAccounts = () => [
  { id: 1, role: 'QuanTriVien', active: true },
  { id: 2, role: 'NguoiChamSoc', active: true, working: true, permission: true, start: '2026-10-01', end: null, elderlyId: 7 },
  { id: 3, role: 'NguoiChamSoc', active: true, working: true, permission: false, start: '2026-10-01', end: null, elderlyId: 7 },
  { id: 4, role: 'NguoiChamSoc', active: true, working: true, permission: true, start: '2026-10-01', end: null, elderlyId: 8 },
  { id: 5, role: 'NguoiChamSoc', active: true, working: true, permission: true, start: '2026-10-01', end: today, elderlyId: 7 },
  { id: 6, role: 'NguoiChamSoc', active: true, working: true, permission: true, start: '2026-10-24', end: null, elderlyId: 7 },
  { id: 7, role: 'NguoiChamSoc', active: false, working: true, permission: true, start: '2026-10-01', end: null, elderlyId: 7 },
  { id: 8, role: 'NguoiChamSoc', active: true, working: false, permission: true, start: '2026-10-01', end: null, elderlyId: 7 },
  { id: 9, role: 'NguoiCaoTuoi', active: true },
  { id: 10, role: 'QuanTriVien', active: false },
  { id: 11, role: 'QuanTriVien', active: true },
];

function load(filename, dependencies, extras = {}) {
  const absolute = path.resolve(__dirname, filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), {
    module, exports: module.exports, process, console, ...extras,
    require: (name) => dependencies[name] || createRequire(absolute)(name),
  }, { filename: absolute });
  return module.exports;
}

function fixture(socketOverride) {
  const accounts = makeAccounts();
  const notifications = [], events = [], queries = [], errors = [];
  const state = { failReads: false };
  class Transaction {}
  class Request {
    input(name, _type, value) { this[name] = value; return this; }
    async query(statement) {
      if (statement.includes('AS sosOwnerUserId')) return { recordset: [] }; // Separate owner-realtime regression.
      if (statement.includes(' AS ready')) return { recordset: [{ ready: 0 }] }; // Legacy staff path.
      if (statement.includes('SELECT DISTINCT nd.UserID AS userId')) {
        if (state.failReads) throw Object.assign(new Error('fixture-only failure'), { code: 'FIXTURE_READ_FAILED' });
        queries.push(statement);
        assert.equal(this.elderlyId, 7);
        assert.match(statement, /nd\.TrangThai=N'HoatDong'/);
        assert.match(statement, /ncs\.TrangThai=N'DangLamViec'/);
        assert.match(statement, /lk\.NguoiCaoTuoiID=@elderlyId/);
        assert.match(statement, /lk\.NgayBatDau<=CAST\(DATEADD\(HOUR,7,SYSUTCDATETIME\(\)\) AS DATE\)/);
        assert.match(statement, /lk\.NgayKetThuc>CAST\(DATEADD\(HOUR,7,SYSUTCDATETIME\(\)\) AS DATE\)/);
        const restricted = statement.includes('FROM PhanQuyen pq');
        if (restricted) {
          assert.match(statement, /EXISTS\s*\(/);
          assert.match(statement, /JOIN ChucNang cn ON cn\.ChucNangID=pq\.ChucNangID/);
          assert.match(statement, /pq\.VaiTroID=nd\.VaiTroID/);
          assert.match(statement, /cn\.MaChucNang=N'QLCANHBAO' AND pq\.ChoPhepXem=1/);
        }
        return { recordset: accounts.filter((a) => a.active && (
          a.role === 'QuanTriVien' || a.role === 'NguoiChamSoc' && a.working
          && a.elderlyId === this.elderlyId && a.start <= today && (!a.end || a.end > today)
          && (!restricted || a.permission)
        )).map((a) => ({ userId: a.id, role: a.role })) };
      }
      if (statement.includes('INSERT INTO ThongBao(')) {
        notifications.push({ userId: this.userId, source: this.source, sourceId: this.sourceId, type: this.type });
        return { recordset: [{ id: notifications.length }] };
      }
      if (statement.includes('WHERE nd.UserID=@userId')) {
        const account = accounts.find((a) => a.id === this.userId);
        return { recordset: account ? [{ VaiTroID: account.role === 'QuanTriVien' ? 1 : account.role === 'NguoiChamSoc' ? 2 : 4,
          TrangThai: account.active ? 'HoatDong' : 'BiKhoa', TenVaiTro: account.role }] : [] };
      }
      throw new Error('Unexpected fixture SQL');
    }
  }
  const pool = { request: () => new Request() };
  const sql = { Transaction, Request, Int: 'Int', NVarChar: () => 'NVarChar' };
  const db = { sql, poolPromise: Promise.resolve(pool) };
  const socket = socketOverride || {
    emitToAdminOnly: (event, data) => events.push({ userId: 'admin-room', event, data }),
    emitToUser: (userId, event, data) => events.push({ userId, event, data }),
  };
  const service = load('../src/services/alertNotification.service.js', { '../config/db': db, '../socket': socket }, {
    console: { error: (...args) => errors.push(args) },
  });
  const notify = (overrides = {}) => service.notifyAlertRecipients(pool, {
    elderlyId: 7, elderlyName: 'Fixture NCT', content: 'Fixture SOS', alertId: 201,
    source: 'CanhBaoKhanCap', sourceId: 101, emergency: true, ...overrides,
  });
  return { accounts, notifications, events, queries, errors, state, db, service, notify };
}

const payload = { canhBaoId: 201, canhBaoKhanCapId: 101, nguoiCaoTuoiId: 7,
  nguonBang: 'CanhBaoKhanCap', nguonId: 101, loaiCanhBao: 'KhanCap' };

test('SOS notifications require active assignment AND alert-view permission, while Admin keeps its bypass', async () => {
  const f = fixture();
  const delivery = await f.notify();
  assert.deepEqual(f.notifications.map((n) => n.userId), [1, 2, 11]);
  assert.deepEqual(Array.from(delivery.caregivers, (r) => r.userId), [2]);
  assert.deepEqual(Array.from(delivery.admins, (r) => r.userId), [1, 11]);
  assert.equal(delivery.sos, true);
  assert.equal(delivery.elderlyId, 7);
  assert.ok(f.queries.every((q) => q.includes('FROM PhanQuyen pq')));
  assert.ok(f.notifications.every((n) => n.type === 'KhanCap' && n.source === 'CanhBaoKhanCap'));
});

test('SOS uses only authorized user rooms, not the cached admin broadcast room', async () => {
  const f = fixture();
  const delivery = await f.notify();
  assert.equal(await f.service.emitAlertNotifications(delivery, payload), true);
  assert.deepEqual(f.events.filter((e) => e.event === 'canhbao:new').map((e) => e.userId), [1, 11, 2]);
  assert.deepEqual(f.events.filter((e) => e.event === 'thongbao:new').map((e) => e.userId), [1, 11, 2]);
  assert.equal(f.events.some((e) => e.userId === 'admin-room'), false);
  assert.equal(f.queries.length, 2, 'Eligibility is rechecked after the write phase');
});

for (const [name, mutate, excluded] of [
  ['caregiver permission revoked', (a) => { a.permission = false; }, 2],
  ['caregiver assignment ended', (a) => { a.end = today; }, 2],
  ['caregiver stopped working', (a) => { a.working = false; }, 2],
  ['caregiver account locked', (a) => { a.active = false; }, 2],
  ['Admin account locked', (a) => { a.active = false; }, 1],
  ['Admin role changed', (a) => { a.role = 'NguoiCaoTuoi'; }, 1],
]) {
  test(`SOS emission fails closed when ${name} after notification selection`, async () => {
    const f = fixture();
    const delivery = await f.notify();
    mutate(f.accounts.find((a) => a.id === excluded));
    await f.service.emitAlertNotifications(delivery, payload);
    assert.equal(f.events.some((e) => e.userId === excluded), false);
    assert.ok(f.events.some((e) => e.userId === 11), 'Other valid Admin still receives');
  });
}

test('SOS emission revalidation failure never leaks or rejects an already committed send', async () => {
  const f = fixture();
  const delivery = await f.notify();
  f.state.failReads = true;
  assert.equal(await f.service.emitAlertNotifications(delivery, payload), false);
  assert.equal(f.events.length, 0);
  assert.equal(f.notifications.length, 3, 'Persisted notifications are not removed');
  assert.equal(f.errors.length, 1);
});

test('Duplicate recipient rows cannot emit the same SOS twice to one account', async () => {
  const f = fixture();
  const delivery = await f.notify();
  delivery.caregivers.push(delivery.caregivers[0]);
  await f.service.emitAlertNotifications(delivery, payload);
  assert.equal(f.events.filter((e) => e.userId === 2 && e.event === 'canhbao:new').length, 1);
  assert.equal(f.events.filter((e) => e.userId === 2 && e.event === 'thongbao:new').length, 1);
});

test('Non-SOS health notifications preserve their existing recipient and emission rules', async () => {
  const f = fixture();
  const delivery = await f.notify({ emergency: false, source: 'ChiSoSucKhoe' });
  assert.deepEqual(f.notifications.map((n) => n.userId), [1, 2, 3, 11]);
  assert.equal(delivery.sos, undefined);
  assert.ok(f.queries.every((q) => !q.includes('FROM PhanQuyen pq')));
  assert.equal(f.service.emitAlertNotifications(delivery, { canhBaoId: 201, loaiCanhBao: 'ChiSoSucKhoe' }), undefined);
  assert.deepEqual(f.events.filter((e) => e.event === 'canhbao:new').map((e) => e.userId), ['admin-room', 2, 3]);
  assert.equal(f.events.filter((e) => e.event === 'thongbao:new').length, 4);
});

test('SOS updates use the same live permission/assignment filter and never broadcast to stale rooms', async () => {
  const f = fixture();
  f.accounts.find((a) => a.id === 1).active = false;
  assert.equal(await f.service.emitSosAlertUpdate(7, { canhBaoId: 201, trangThai: 'DaTiepNhan' }), true);
  assert.deepEqual(f.events.map((e) => [e.userId, e.event]), [[2, 'canhbao:updated'], [11, 'canhbao:updated']]);
  f.events.length = 0;
  f.accounts.find((a) => a.id === 2).permission = false;
  f.accounts.find((a) => a.id === 11).role = 'NguoiCaoTuoi';
  await f.service.emitSosAlertUpdate(7, { canhBaoId: 201, trangThai: 'DaXuLy' });
  assert.equal(f.events.length, 0);
  assert.ok(f.queries.every((q) => q.includes('FROM PhanQuyen pq')));
});

test('SOS update lookup failure fails closed without pretending a committed transition failed', async () => {
  const f = fixture();
  f.state.failReads = true;
  assert.equal(await f.service.emitSosAlertUpdate(7, { canhBaoId: 201 }), false);
  assert.equal(f.events.length, 0);
  assert.equal(f.errors.length, 1);
  assert.equal(await f.service.emitSosAlertUpdate('bad', {}), false);
  assert.equal(f.events.length, 0);
});

function workflowFixture(linked, deliveryAvailable = true) {
  const trace = { committed: 0, rolledBack: 0, updates: 0, helper: [], events: [] };
  class Transaction {
    async begin() {}
    async commit() { trace.committed++; }
    async rollback() { trace.rolledBack++; }
  }
  class Request {
    input() { return this; }
    async query(statement) {
      if (statement.includes('FROM CanhBao WITH')) return { recordset: [{ id: 201, elderlyId: 7,
        status: 'ChuaXuLy', source: linked ? 'CanhBaoKhanCap' : 'ChiSoSucKhoe', sourceId: linked ? 101 : 301 }] };
      if (statement.includes('SELECT v.TenVaiTro AS role')) return { recordset: [{ role: 'QuanTriVien' }] };
      if (statement.includes('FROM CanhBaoKhanCap WITH')) return { recordset: [{ elderlyId: 7, status: 'DangGui' }] };
      if (statement.startsWith('UPDATE')) { trace.updates++; return { rowsAffected: [1] }; }
      if (statement.includes('SELECT UserID FROM HoSoNguoiCaoTuoi')) return { recordset: [{ UserID: 900 }] };
      throw new Error('Unexpected workflow fixture SQL');
    }
  }
  const db = { sql: { Transaction, Request, Int: 'Int', NVarChar: () => 'NVarChar',
    ISOLATION_LEVEL: { SERIALIZABLE: 'SERIALIZABLE' } }, poolPromise: Promise.resolve({ request: () => new Request() }) };
  const workflow = load('../src/services/alertWorkflow.service.js', {
    '../config/db': db,
    '../socket': {
      emitToAdmin: (event, data) => trace.events.push({ userId: 'admin-room', event, data }),
      emitToUser: (userId, event, data) => trace.events.push({ userId, event, data }),
    },
    './alertNotification.service': { emitOwnSos: async (elderlyId, data, event) => {
      assert.equal(trace.committed, 1); assert.equal(elderlyId, 7); assert.equal(data.canhBaoKhanCapId, 101);
      trace.events.push({ userId: 900, event, data });
    }, emitSosAlertUpdate: async (elderlyId, data) => {
      assert.equal(trace.committed, 1, 'Update may only emit after commit');
      trace.helper.push({ elderlyId, data });
      return deliveryAvailable;
    } },
  });
  return { trace, transition: () => workflow.transition({ user: { userId: 501, tenVaiTro: 'QuanTriVien' },
    alertId: 201, action: 'seen' }) };
}

test('Linked SOS workflow routes updates through permission helper after commit and preserves owner Mobile update', async () => {
  const f = workflowFixture(true);
  const result = await f.transition();
  assert.equal(result.trangThai, 'DaTiepNhan');
  assert.equal(f.trace.updates, 2);
  assert.equal(f.trace.helper.length, 1);
  assert.equal(f.trace.helper[0].elderlyId, 7);
  assert.deepEqual(f.trace.events.map((e) => [e.userId, e.event]), [[900, 'canhbao:updated']]);
  assert.equal(f.trace.rolledBack, 0);
});

test('Failed SOS realtime revalidation does not rollback committed handling or skip its owner update', async () => {
  const f = workflowFixture(true, false);
  assert.equal((await f.transition()).trangThai, 'DaTiepNhan');
  assert.equal(f.trace.committed, 1);
  assert.equal(f.trace.rolledBack, 0);
  assert.equal(f.trace.events.some((e) => e.userId === 'admin-room'), false);
  assert.equal(f.trace.events.some((e) => e.userId === 900), true);
});

test('Unlinked ordinary-alert workflow retains the previous realtime broadcast path', async () => {
  const f = workflowFixture(false);
  assert.equal((await f.transition()).trangThai, 'DaXem');
  assert.equal(f.trace.updates, 1);
  assert.equal(f.trace.helper.length, 0);
  assert.deepEqual(f.trace.events.map((e) => e.userId), ['admin-room', 900]);
});

test('Connected valid Admin/caregiver clients receive SOS; forbidden and stale Admin sockets receive nothing', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-sos-permission-test-only';
  const f = fixture();
  const sockets = load('../src/socket.js', { './config/db': f.db });
  const service = load('../src/services/alertNotification.service.js', { '../config/db': f.db, '../socket': sockets });
  const server = http.createServer((_req, res) => res.end('isolated fixture only'));
  const io = sockets.initSocket(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const clients = [];
  const received = new Map();
  const updated = new Map();
  try {
    for (const id of [1, 2, 3, 4, 9, 11]) {
      const account = f.accounts.find((a) => a.id === id);
      const client = createClient(`http://127.0.0.1:${server.address().port}`, {
        auth: { token: jwt.sign({ userId: id, vaiTroId: account.role === 'QuanTriVien' ? 1 : account.role === 'NguoiChamSoc' ? 2 : 4,
          tenVaiTro: account.role, sessionVersion: 2 }, process.env.JWT_SECRET, { expiresIn: '2m' }) },
        transports: ['websocket'], reconnection: false,
      });
      clients.push(client);
      received.set(id, []);
      updated.set(id, []);
      client.on('canhbao:new', (data) => received.get(id).push(data));
      client.on('canhbao:updated', (data) => updated.get(id).push(data));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('FIXTURE_CONNECT_TIMEOUT')), 3000);
        client.once('connect', () => { clearTimeout(timer); resolve(); });
        client.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
      });
    }
    const delivery = await service.notifyAlertRecipients(await f.db.poolPromise, {
      elderlyId: 7, elderlyName: 'Fixture NCT', content: 'Fixture SOS', alertId: 201,
      source: 'CanhBaoKhanCap', sourceId: 101, emergency: true,
    });
    f.accounts.find((a) => a.id === 1).active = false; // Its old Admin socket stays connected.
    await service.emitAlertNotifications(delivery, payload);
    await new Promise((resolve) => setTimeout(resolve, 75));
    for (const id of [2, 11]) assert.equal(received.get(id).length, 1, `eligible user ${id}`);
    for (const id of [1, 3, 4, 9]) assert.equal(received.get(id).length, 0, `forbidden user ${id}`);
    assert.equal(received.get(2)[0].canhBaoKhanCapId, 101);
    await service.emitSosAlertUpdate(7, { canhBaoId: 201, trangThai: 'DaTiepNhan' });
    await new Promise((resolve) => setTimeout(resolve, 75));
    for (const id of [2, 11]) assert.equal(updated.get(id).length, 1, `eligible updated user ${id}`);
    for (const id of [1, 3, 4, 9]) assert.equal(updated.get(id).length, 0, `forbidden updated user ${id}`);
  } finally {
    clients.forEach((client) => client.close());
    await io.close();
    if (originalSecret == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
