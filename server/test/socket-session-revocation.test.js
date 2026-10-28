const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { createRequire } = require('node:module');
const { io: client } = require('socket.io-client');

const secret = 'socket-revocation-fixture-only';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(t, options = {}) {
  const accounts = new Map(['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi', 'NguoiThan']
    .map((role, i) => [i + 1, { VaiTroID: i + 1, TenVaiTro: role, TrangThai: 'HoatDong' }]));
  const state = { failReads: false, gate: null };
  const db = { sql: { Int: 'Int' }, poolPromise: Promise.resolve({ request: () => ({
    input(_key, _type, id) { this.id = id; return this; },
    async query() {
      await state.gate;
      if (state.failReads) throw Error('FIXTURE_DB_UNAVAILABLE');
      return { recordset: accounts.has(this.id) ? [{ ...accounts.get(this.id) }] : [] };
    },
  }) }) };
  const filename = path.resolve(__dirname, '../src/socket.js'), module = { exports: {} }, local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    process: { env: { JWT_SECRET: secret } }, console: { error() {} },
    require: name => name === './config/db' ? db : local(name),
  }, { filename });
  const socket = module.exports, server = http.createServer(), io = socket.initSocket(server), clients = [];
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { clients.forEach(c => c.close()); await new Promise(resolve => io.close(resolve)); });
  const connect = async (id, expiresIn = '5m') => {
    const a = accounts.get(id), token = jwt.sign({ userId: id, vaiTroId: a.VaiTroID,
      tenVaiTro: a.TenVaiTro, sessionVersion: 2 }, secret, { expiresIn });
    const c = client(`http://127.0.0.1:${server.address().port}`, {
      auth: { token }, transports: ['websocket'], reconnection: false,
    });
    clients.push(c);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('CONNECT_TIMEOUT')), 2000);
      c.once('connect', () => { clearTimeout(timer); resolve(); });
      c.once('connect_error', error => { clearTimeout(timer); reject(error); });
    });
    return { c, expiresAt: jwt.decode(token).exp * 1000 };
  };
  return { accounts, state, socket, connect, ...options };
}

test('disabled Admin receives neither admin broadcast path; stale socket is disconnected', async t => {
  const f = await fixture(t), { c } = await f.connect(1), seen = [];
  c.on('chisuckhoe:new', row => seen.push(row));
  f.accounts.get(1).TrangThai = 'KhoaTaiKhoan';
  assert.equal(f.socket.emitToAdminOnly('chisuckhoe:new', { giaTri: 150 }), true);
  assert.equal(f.socket.emitToAdmin('chisuckhoe:new', { giaTri: 160 }), true);
  await wait(80);
  assert.deepEqual(seen, []); assert.equal(c.connected, false);
});

test('JWT expiry closes an idle socket and cannot be bypassed by a user-room event', async t => {
  const f = await fixture(t), { c, expiresAt } = await f.connect(3, '2s'), seen = [];
  c.on('thongbao:new', row => seen.push(row));
  await wait(Math.max(0, expiresAt - Date.now()) + 80);
  assert.equal(c.connected, false);
  f.socket.emitToUser(3, 'thongbao:new', { id: 7 }); await wait(60);
  assert.deepEqual(seen, []);
});

test('each of four roles keeps its own active sessions; no event crosses user rooms', async t => {
  const f = await fixture(t), sessions = await Promise.all([1, 2, 3, 4].map(id => f.connect(id)));
  const seen = sessions.map(() => []);
  sessions.forEach(({ c }, i) => c.on('thongbao:new', row => seen[i].push(row.id)));
  [1, 2, 3, 4].forEach(id => f.socket.emitToUser(id, 'thongbao:new', { id }));
  await wait(80); assert.deepEqual(seen, [[1], [2], [3], [4]]);
  f.accounts.get(2).TenVaiTro = 'NguoiCaoTuoi';
  f.socket.emitToUser(2, 'thongbao:new', { id: 99 }); await wait(70);
  assert.deepEqual(seen[1], [2]); assert.equal(sessions[1].c.connected, false);
  assert.ok([0, 2, 3].every(i => sessions[i].c.connected));
});

test('queued delivery checks current account after an async read, and DB failure fails closed', async t => {
  const f = await fixture(t), { c } = await f.connect(1), seen = [];
  c.on('chisuckhoe:new', row => seen.push(row));
  let release; f.state.gate = new Promise(resolve => { release = resolve; });
  f.socket.emitToAdminOnly('chisuckhoe:new', { id: 1 });
  f.accounts.get(1).TrangThai = 'KhoaTaiKhoan'; release(); await wait(80);
  assert.deepEqual(seen, []);
  f.accounts.get(1).TrangThai = 'HoatDong'; f.state.gate = null;
  const second = await f.connect(1); second.c.on('chisuckhoe:new', row => seen.push(row));
  f.state.failReads = true; f.socket.emitToAdminOnly('chisuckhoe:new', { id: 2 });
  await wait(70); assert.deepEqual(seen, []);
});

test('account lock disconnects all devices of that user; reconnect must reauthenticate', async t => {
  const f = await fixture(t), a = await f.connect(1), b = await f.connect(1), other = await f.connect(3);
  f.accounts.get(1).TrangThai = 'KhoaTaiKhoan';
  assert.equal(f.socket.disconnectUser(1), 2); await wait(60);
  assert.equal(a.c.connected, false); assert.equal(b.c.connected, false); assert.equal(other.c.connected, true);
  await assert.rejects(f.connect(1), /INVALID_TOKEN/);
});
