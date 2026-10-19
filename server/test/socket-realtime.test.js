const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const loadSocket = () => {
  const filename = path.resolve(__dirname, '../src/socket.js');
  const module = { exports: {} };
  const pool = { request: () => ({
    input(_name, _type, userId) { this.userId = userId; return this; },
    async query() { return { recordset: [{ VaiTroID: this.userId >= 30 ? 4 : 1,
      TrangThai: 'HoatDong', TenVaiTro: this.userId >= 30 ? 'NguoiCaoTuoi' : 'QuanTriVien' }] }; },
  }) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process, console,
    require: (name) => name === './config/db'
      ? { poolPromise: Promise.resolve(pool), sql: { Int: 'Int' } }
      : createRequire(filename)(name),
  }, { filename });
  return module.exports;
};

test('Authenticated Web client receives SOS event from admin room', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'socket-test-secret';

  const httpServer = http.createServer((_, res) => res.end('ok'));
  const { initSocket, emitToAdmin } = loadSocket();
  const socketServer = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));

  const token = jwt.sign(
    { userId: 1, vaiTroId: 1, tenVaiTro: 'QuanTriVien', sessionVersion: 2 },
    process.env.JWT_SECRET,
    { expiresIn: '5m' },
  );
  const client = createClient(`http://127.0.0.1:${httpServer.address().port}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SOCKET_CONNECT_TIMEOUT')), 3000);
      client.once('connect', () => { clearTimeout(timer); resolve(); });
      client.once('connect_error', reject);
    });

    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SOCKET_EVENT_TIMEOUT')), 3000);
      client.once('canhbao:new', (payload) => { clearTimeout(timer); resolve(payload); });
    });
    assert.equal(emitToAdmin('canhbao:new', { canhBaoId: 42, loaiCanhBao: 'KhanCap' }), true);
    assert.deepEqual(await received, { canhBaoId: 42, loaiCanhBao: 'KhanCap' });
  } finally {
    client.close();
    await socketServer.close();
    if (originalSecret == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test('Authenticated Web client receives a new health metric event from admin room', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'health-socket-test-secret';

  const httpServer = http.createServer((_, res) => res.end('ok'));
  const { initSocket, emitToAdmin } = loadSocket();
  const socketServer = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));

  const token = jwt.sign(
    { userId: 2, vaiTroId: 1, tenVaiTro: 'QuanTriVien', sessionVersion: 2 },
    process.env.JWT_SECRET,
    { expiresIn: '5m' },
  );
  const client = createClient(`http://127.0.0.1:${httpServer.address().port}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SOCKET_CONNECT_TIMEOUT')), 3000);
      client.once('connect', () => { clearTimeout(timer); resolve(); });
      client.once('connect_error', reject);
    });

    const payload = {
      chiSoId: 73,
      nguoiCaoTuoiId: 9,
      loaiChiSo: 'HUYET_AP',
      giaTri: 120,
      giaTriPhu: 90,
      laBatThuong: false,
    };
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SOCKET_EVENT_TIMEOUT')), 3000);
      client.once('chisuckhoe:new', (data) => { clearTimeout(timer); resolve(data); });
    });
    assert.equal(emitToAdmin('chisuckhoe:new', payload), true);
    assert.deepEqual(await received, payload);
  } finally {
    client.close();
    await socketServer.close();
    if (originalSecret == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test('Appointment event is delivered only to the authenticated Mobile user room', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'mobile-appointment-socket-test-secret';
  const httpServer = http.createServer((_, res) => res.end('ok'));
  const { initSocket, emitToUser } = loadSocket();
  const socketServer = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));

  const makeClient = (userId) => createClient(
    `http://127.0.0.1:${httpServer.address().port}`,
    {
      auth: { token: jwt.sign(
        { userId, vaiTroId: 4, tenVaiTro: 'NguoiCaoTuoi', sessionVersion: 2 },
        process.env.JWT_SECRET,
        { expiresIn: '5m' },
      ) },
      transports: ['websocket'],
      reconnection: false,
    },
  );
  const intended = makeClient(31);
  const other = makeClient(32);
  try {
    await Promise.all([intended, other].map((client) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SOCKET_CONNECT_TIMEOUT')), 3000);
      client.once('connect', () => { clearTimeout(timer); resolve(); });
      client.once('connect_error', reject);
    })));
    let leaked = false;
    other.once('lichkham:updated', () => { leaked = true; });
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SOCKET_EVENT_TIMEOUT')), 3000);
      intended.once('lichkham:updated', (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
    const payload = { id: 72, nguoiCaoTuoiId: 8, action: 'cancelled' };
    assert.equal(emitToUser(31, 'lichkham:updated', payload), true);
    assert.deepEqual(await received, payload);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(leaked, false);
  } finally {
    intended.close();
    other.close();
    await socketServer.close();
    if (originalSecret == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
