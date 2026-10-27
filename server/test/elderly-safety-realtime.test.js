const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { createRequire } = require('node:module');
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');
const load = (file, stubs) => {
  const filename = path.resolve(__dirname, '../src', file), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, console, process: { env: { JWT_SECRET: 'elderly-stage4-fixture-only' } },
    require: name => stubs[name] || createRequire(filename)(name) }, { filename }); return module.exports;
};

test('production Socket.IO routes owner SOS only to the active authorized NCT, never a different account; revocation rechecked', async () => {
  const accounts = [{ id: 31, role: 'NguoiCaoTuoi', active: true, permission: true, elderlyId: 7 }, { id: 32, role: 'NguoiCaoTuoi', active: true, permission: true, elderlyId: 8 }];
  const events = [];
  const pool = { request() { const params = {}; return { input(key, _, value) { params[key] = value; return this; }, async query(statement) {
    if (statement.includes('AS sosOwnerUserId')) {
      for (const contract of [/nct\.NguoiCaoTuoiID=@elderlyId/, /nd\.TrangThai=N'HoatDong'/, /vt\.TenVaiTro=N'NguoiCaoTuoi'/, /pq\.ChoPhepXem=1/]) assert.match(statement, contract);
      return { recordset: accounts.filter(a => a.elderlyId === params.elderlyId && a.active && a.role === 'NguoiCaoTuoi' && a.permission).map(a => ({ sosOwnerUserId: a.id })) };
    }
    const a = accounts.find(a => a.id === params.userId);
    return { recordset: a ? [{ VaiTroID: 3, TenVaiTro: a.role, TrangThai: a.active ? 'HoatDong' : 'BiKhoa' }] : [] };
  } }; } };
  const db = { poolPromise: Promise.resolve(pool), sql: { Int: 'int' } };
  const socket = load('socket.js', { './config/db': db });
  const service = load('services/alertNotification.service.js', { '../config/db': db, '../socket': socket });
  const server = http.createServer(), io = socket.initSocket(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const clients = accounts.map(a => createClient(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], reconnection: false,
    auth: { token: jwt.sign({ userId: a.id, vaiTroId: 3, tenVaiTro: a.role, sessionVersion: 2 }, 'elderly-stage4-fixture-only', { expiresIn: '5m' }) } }));
  try {
    await Promise.all(clients.map((client, index) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('SOCKET_TIMEOUT')), 3000);
      client.once('connect', () => { clearTimeout(timeout); resolve(); }); client.once('connect_error', reject);
      client.on('canhbao:new', data => events.push({ user: accounts[index].id, data }));
    })));
    const payload = { canhBaoId: 9, canhBaoKhanCapId: 10, nguoiCaoTuoiId: 7, nguonBang: 'CanhBaoKhanCap', trangThai: 'CHUA_XU_LY', viDo: 1, kinhDo: 2, ghiChuXuLy: 'INTERNAL' };
    assert.equal(await service.emitOwnSos(7, payload), true);
    await new Promise(resolve => setTimeout(resolve, 80)); assert.deepEqual(events.map(event => event.user), [31]);
    assert.equal('ghiChuXuLy' in events[0].data, false); assert.equal('viDo' in events[0].data, false);
    for (const change of [a => { a.permission = false; }, a => { a.active = false; }, a => { a.role = 'NguoiThan'; }]) {
      Object.assign(accounts[0], { permission: true, active: true, role: 'NguoiCaoTuoi' }); change(accounts[0]);
      assert.equal(await service.emitOwnSos(7, payload), false);
    }
    assert.equal(await service.emitOwnSos(8, payload), false);
    await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(events.length, 1);
  } finally { clients.forEach(client => client.close()); await io.close(); }
});

test('notifications API uses the authenticated account for reads and mark-read, never changes SOS state', async () => {
  const notices = [{ id: 1, userId: 31, daDoc: false }, { id: 2, userId: 32, daDoc: false }], queries = [], reminders = [];
  const pool = { request() { const params = {}; return { input(key, _, value) { params[key] = value; return this; }, async query(statement) {
    queries.push(statement); assert.match(statement, /UserID\s*=\s*@userId/);
    if (statement.includes('UPDATE')) {
      const item = notices.find(n => n.id === params.id && n.userId === params.userId);
      if (item) item.daDoc = true;
      return { recordset: item ? [{ id: item.id, daDoc: item.daDoc }] : [] };
    }
    return { recordset: notices.filter(n => n.userId === params.userId) };
  } }; } };
  const controller = load('controllers/notification.controller.js', {
    '../config/db': { poolPromise: Promise.resolve(pool), sql: { Int: 'int' } },
    '../utils/response': { ok: (res, data) => Object.assign(res, { status: 200, data }), fail: (res, message, code, status) => Object.assign(res, { status, code }) },
    '../services/appointmentReminder.service': { materializeDueAppointmentReminders: async () => reminders.push('appointments') },
    '../services/medicationReminder.service': { materializeDueMedicationReminders: async () => reminders.push('medications') },
  });
  const invoke = async (handler, id) => { const res = {}; await handler({ user: { userId: 31 }, params: { id }, body: { userId: 32 } }, res, error => { throw error; }); return res; };
  assert.equal((await invoke(controller.getMine)).data.length, 1);
  assert.deepEqual(reminders, ['appointments', 'medications']); // Both are mocks; never connected to SQL.
  assert.equal((await invoke(controller.markRead, 2)).status, 404);
  assert.equal((await invoke(controller.markRead, 1)).status, 200);
  assert.equal(notices[1].daDoc, false); assert.ok(queries.every(sql => !/UPDATE CanhBao/.test(sql)));
});
