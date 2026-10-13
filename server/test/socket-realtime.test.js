const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');

test('Authenticated Web client receives SOS event from admin room', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'socket-test-secret';

  const httpServer = http.createServer((_, res) => res.end('ok'));
  const { initSocket, emitToAdmin } = require('../src/socket');
  const socketServer = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));

  const token = jwt.sign(
    { userId: 1, vaiTroId: 1, tenVaiTro: 'QuanTriVien' },
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
  const socketModulePath = require.resolve('../src/socket');
  delete require.cache[socketModulePath];
  const { initSocket, emitToAdmin } = require('../src/socket');
  const socketServer = initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));

  const token = jwt.sign(
    { userId: 2, vaiTroId: 1, tenVaiTro: 'QuanTriVien' },
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
    delete require.cache[socketModulePath];
    if (originalSecret == null) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
