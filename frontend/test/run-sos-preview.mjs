// Manual, isolated browser fixture. No .env, production database, GPS or calls.
// Run: node frontend/test/run-sos-preview.mjs
// Open: http://127.0.0.1:5187/__sos-preview?user=501
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.dirname(frontendRoot);
const serverRoot = path.join(repositoryRoot, 'server');
const frontendRequire = createRequire(path.join(frontendRoot, 'package.json'));
const serverRequire = createRequire(path.join(serverRoot, 'package.json'));
const { createServer: createViteServer } = await import(pathToFileURL(frontendRequire.resolve('vite')).href);
const { default: react } = await import(pathToFileURL(frontendRequire.resolve('@vitejs/plugin-react')).href);
const { Server: SocketServer } = serverRequire('socket.io');
const port = 5187; // Deliberately fixed, never falls back to production 5000/5173.
const origin = `http://127.0.0.1:${port}`;
const users = [
  { userId: 501, role: 'QuanTriVien', permission: true, name: 'Admin kiểm thử' },
  { userId: 502, role: 'NguoiChamSoc', permission: true, name: 'Người chăm sóc kiểm thử' },
  { userId: 503, role: 'NguoiChamSoc', permission: false, name: 'Tài khoản không quyền kiểm thử' },
];
const state = { fixtureOnly: true, writes: [], events: [], alerts: [], sos: [], notifications: [],
  commits: 0, rollbacks: 0, pending: [], latestDelivery: null, latestPayload: null };
// Unique IDs across preview restarts avoid colliding with the browser's heard-ID ledger.
let sosSequence = Date.now() % 100000000, alertSequence = sosSequence + 100000000, notificationSequence = sosSequence + 200000000;
const wallNow = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 19);
const jsonCopy = (value) => JSON.parse(JSON.stringify(value));

class Transaction {
  constructor() { this.pending = []; }
  async begin() { this.active = true; }
  async commit() {
    for (const entry of this.pending) {
      state[entry.collection].push(entry.row);
      state.writes.push({ table: entry.collection, id: entry.row.id });
    }
    this.pending = [];
    this.active = false;
    state.commits++;
  }
  async rollback() { this.pending = []; this.active = false; state.rollbacks++; }
}
class Request {
  constructor(transaction) { this.transaction = transaction; this.inputs = {}; }
  input(name, _type, value) { this.inputs[name] = value; return this; }
  insert(collection, row) {
    if (this.transaction instanceof Transaction) this.transaction.pending.push({ collection, row });
    else { state[collection].push(row); state.writes.push({ table: collection, id: row.id }); }
  }
  async query(statement) {
    const p = this.inputs;
    if (statement.includes('FROM HoSoNguoiCaoTuoi WHERE UserID')) {
      return { recordset: p.userId === 3 ? [{ id: 7, name: 'NCT mô phỏng — không phải hồ sơ thật' }] : [] };
    }
    if (statement.includes('FROM CanhBaoKhanCap sos WITH')) return { recordset: [] };
    if (statement.includes('INSERT INTO CanhBaoKhanCap')) {
      const row = { id: ++sosSequence, nguoiCaoTuoiId: p.elderlyId, trangThai: 'DangGui',
        ngayGui: wallNow(), viDo: p.viDo, kinhDo: p.kinhDo, noiDung: p.noiDung };
      this.insert('sos', row);
      return { recordset: [row] };
    }
    if (statement.includes('INSERT INTO CanhBao (')) {
      const row = { id: ++alertSequence, canhBaoId: alertSequence, nguoiCaoTuoiId: p.elderlyId,
        nguoiCaoTuoiTen: 'NCT mô phỏng — không phải hồ sơ thật', loaiCanhBao: 'KhanCap',
        mucDo: 'KHAN_CAP', trangThai: 'CHUA_XU_LY', trangThaiLabel: 'Chưa xử lý',
        nguonBang: 'CanhBaoKhanCap', nguonId: p.emergencyId, canhBaoKhanCapId: p.emergencyId,
        moTa: p.noiDung, noiDung: p.noiDung, thoiGianPhatHien: wallNow() };
      this.insert('alerts', row);
      return { recordset: [{ id: row.id }] };
    }
    if (statement.includes('SELECT DISTINCT nd.UserID AS userId')) {
      const restricted = statement.includes('FROM PhanQuyen pq');
      return { recordset: users.filter((u) => u.role === 'QuanTriVien'
        || u.role === 'NguoiChamSoc' && (!restricted || u.permission))
        .map((u) => ({ userId: u.userId, role: u.role })) };
    }
    if (statement.includes('INSERT INTO ThongBao(')) {
      const row = { id: ++notificationSequence, userId: p.userId, tieuDe: p.title,
        noiDung: p.content, loaiThongBao: p.type, lienKetBang: p.source, lienKetId: p.sourceId };
      this.insert('notifications', row);
      return { recordset: [{ id: row.id }] };
    }
    throw new Error(`Isolated fixture rejects SQL: ${statement.slice(0, 60)}`);
  }
}
const sql = { Transaction, Request, Int: 'Int', NVarChar: () => 'NVarChar', Decimal: () => 'Decimal',
  ISOLATION_LEVEL: { SERIALIZABLE: 'SERIALIZABLE' } };
const pool = { request: () => new Request() };
const db = { sql, poolPromise: Promise.resolve(pool) };
function loadProduction(relativeFile, dependencies) {
  const filename = path.join(serverRoot, relativeFile);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Fixture forbids dependency ${name}; production DB/auth must never load`);
    },
  }, { filename });
  return module.exports;
}

const vite = await createViteServer({
  root: frontendRoot, configFile: false, envDir: false, appType: 'custom', plugins: [react()],
  server: { middlewareMode: true, hmr: false, host: '127.0.0.1', strictPort: true },
  define: {
    'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin),
    'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/api`),
  },
});
const server = http.createServer();
const io = new SocketServer(server, { serveClient: false, cors: { origin: false } });
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const user = users.find((u) => token === `fixture-${u.userId}`);
  if (!user) return next(new Error('FIXTURE_TOKEN_REQUIRED'));
  socket.user = user;
  next();
});
io.on('connection', (socket) => {
  socket.join(`user_${socket.user.userId}`);
  if (socket.user.role === 'QuanTriVien') socket.join('admin');
});
const emitToUser = (userId, event, data) => {
  state.events.push({ userId, event, data: jsonCopy(data), afterCommit: state.commits });
  if (event === 'canhbao:new' && data.nguonBang === 'CanhBaoKhanCap') state.latestPayload = jsonCopy(data);
  io.to(`user_${userId}`).emit(event, data);
  return true;
};
const socketApi = { emitToUser, emitToAdminOnly: (event, data) => {
  state.events.push({ userId: 'admin-room', event, data: jsonCopy(data), afterCommit: state.commits });
  io.to('admin').emit(event, data);
  return true;
} };
const notificationService = loadProduction('src/services/alertNotification.service.js', {
  '../config/db': db, '../socket': socketApi,
});
const responses = loadProduction('src/utils/response.js', {});
const controller = loadProduction('src/controllers/emergencyAlert.controller.js', {
  '../config/db': db, '../utils/response': responses,
  '../middlewares/mobile-scope.middleware': { scopedWhere: () => ' AND 1=0' },
  '../services/alertNotification.service': {
    ...notificationService,
    emitAlertNotifications(delivery, payload) {
      state.latestDelivery = delivery;
      state.latestPayload = jsonCopy(payload);
      const pending = Promise.resolve(notificationService.emitAlertNotifications(delivery, payload));
      state.pending.push(pending);
      return pending;
    },
  },
  '../services/alertWorkflow.service': { endpoint: () => () => { throw new Error('Fixture forbids SOS state mutation'); } },
});

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 8192) throw new Error('Fixture body limit');
  }
  return text ? JSON.parse(text) : {};
}
function fixtureUser(req) {
  // Test-only, per-tab identity allows simultaneous synthetic roles in one browser.
  if (req.headers['x-fixture-user']) return users.find((u) => String(u.userId) === req.headers['x-fixture-user']);
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  return users.find((u) => token === `fixture-${u.userId}`);
}
const html = `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CareSenior SOS — KIỂM THỬ CÁCH LY</title></head><body><div id="root"></div><script type="module" src="/test/fixtures/sosPreview.jsx"></script></body></html>`;
server.on('request', async (req, res) => {
  // Socket.IO owns its Engine.IO path; do not let Vite send a second response.
  if (req.url?.startsWith('/socket.io/')) return;
  try {
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/__fixture/')) {
      if (url.pathname === '/__fixture/state' && req.method === 'GET') {
        return sendJson(res, 200, { fixtureOnly: true, writes: state.writes, events: state.events,
          alerts: state.alerts, sos: state.sos, notifications: state.notifications,
          counts: { commits: state.commits, rollbacks: state.rollbacks, sockets: io.engine.clientsCount } });
      }
      if (req.method !== 'POST') return sendJson(res, 405, { fixtureOnly: true, error: 'POST required' });
      const body = await readBody(req);
      if (url.pathname === '/__fixture/sos') {
        let responseStatus = 200, responseBody, failure;
        const response = { status(code) { responseStatus = code; return this; }, json(data) { responseBody = data; return this; } };
        await controller.create({ user: { userId: 3, tenVaiTro: 'NguoiCaoTuoi' },
          body: { noiDung: 'SOS mô phỏng trong bộ nhớ — KHÔNG PHẢI CẢNH BÁO THẬT' } }, response, (err) => { failure = err; });
        await Promise.all(state.pending.splice(0));
        if (failure) throw failure;
        return sendJson(res, responseStatus, responseBody);
      }
      if (url.pathname === '/__fixture/replay') {
        if (!state.latestDelivery || !state.latestPayload) return sendJson(res, 409, { error: 'Create fixture SOS first' });
        await notificationService.emitAlertNotifications(state.latestDelivery, state.latestPayload);
        return sendJson(res, 200, { fixtureOnly: true, replayed: state.latestPayload.canhBaoKhanCapId });
      }
      if (url.pathname === '/__fixture/ordinary') {
        const ordinary = { id: ++alertSequence, canhBaoId: alertSequence, nguoiCaoTuoiId: 7,
          nguoiCaoTuoiTen: 'NCT mô phỏng', nguonBang: 'ChiSoSucKhoe', nguonId: alertSequence,
          loaiCanhBao: 'CanhBaoChiSo', mucDo: 'KHAN_CAP', trangThai: 'CHUA_XU_LY',
          thoiGianPhatHien: wallNow(), moTa: 'Chỉ số mô phỏng — không phải SOS' };
        state.alerts.push(ordinary);
        const delivery = await notificationService.notifyAlertRecipients(pool, { elderlyId: 7, elderlyName: 'NCT mô phỏng',
          content: ordinary.moTa, alertId: ordinary.id, source: 'ChiSoSucKhoe', sourceId: ordinary.id, emergency: false });
        notificationService.emitAlertNotifications(delivery, ordinary);
        return sendJson(res, 200, { fixtureOnly: true, id: ordinary.id });
      }
      if (url.pathname === '/__fixture/disconnect') {
        const sockets = [...io.of('/').sockets.values()];
        let disconnected = 0;
        for (const socket of sockets) {
          if (body.userId == null || socket.user.userId === Number(body.userId)) {
            socket.conn.close(); // Transport interruption triggers normal client reconnect.
            disconnected++;
          }
        }
        return sendJson(res, 200, { fixtureOnly: true, disconnected });
      }
      return sendJson(res, 404, { fixtureOnly: true, error: 'Unknown fixture control' });
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') return sendJson(res, 405, { fixtureOnly: true, error: 'API writes forbidden in browser fixture' });
      const user = fixtureUser(req);
      if (!user) return sendJson(res, 401, { success: false, errorCode: 'FIXTURE_TOKEN_REQUIRED' });
      if (!user.permission) return sendJson(res, 403, { success: false, errorCode: 'FORBIDDEN', message: 'Tài khoản kiểm thử không có quyền xem SOS' });
      if (url.pathname === '/api/alerts') {
        const rows = url.searchParams.get('trangThai')
          ? state.alerts.filter((a) => a.trangThai === url.searchParams.get('trangThai')) : state.alerts;
        return sendJson(res, 200, { success: true, data: rows });
      }
      if (url.pathname === '/api/emergency-alerts') {
        const rows = state.sos.map((s) => {
          const linked = state.alerts.find((a) => a.nguonBang === 'CanhBaoKhanCap' && a.nguonId === s.id);
          return { ...linked, ...s, canhBaoId: linked?.id, nguonId: s.id, trangThai: 'CHUA_XU_LY',
            nguonBang: 'CanhBaoKhanCap', thoiGianPhatHien: s.ngayGui };
        });
        return sendJson(res, 200, { success: true, data: rows });
      }
      if (url.pathname === '/api/elderly' || url.pathname === '/api/caregivers') {
        return sendJson(res, 200, { success: true, data: [] });
      }
      return sendJson(res, 404, { fixtureOnly: true, error: 'Unknown API read' });
    }
    if (['/', '/__sos-preview', '/canh-bao'].includes(url.pathname)) {
      const transformed = await vite.transformIndexHtml(req.url, html);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(transformed);
    }
    vite.middlewares(req, res, () => sendJson(res, 404, { fixtureOnly: true, error: 'Not found' }));
  } catch (error) {
    console.error('[SOS FIXTURE]', error.message);
    if (!res.headersSent) sendJson(res, 500, { fixtureOnly: true, error: error.message });
    else res.end();
  }
});
server.once('error', async (error) => { console.error('[SOS FIXTURE]', error.message); await vite.close(); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`ISOLATED_SOS_PREVIEW ${origin}/__sos-preview — in-memory only; no .env/production DB`));
async function close() { await io.close(); await vite.close(); process.exit(0); }
process.once('SIGINT', close);
process.once('SIGTERM', close);
