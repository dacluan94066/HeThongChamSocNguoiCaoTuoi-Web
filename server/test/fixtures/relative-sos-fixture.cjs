// RAM SQL model + production SOS/controller/Socket.IO. Never loads config/db or .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { createRequire } = require('node:module');
const { createRelativeReadRepository } = require('../../src/services/relativeRead.repository');
const { READ_FEATURES, allowedRelativeRequest } = require('../../src/utils/relativePolicy');

function createFixture({ fallback } = {}) {
  const secret = 'relative-sos-isolated-fixture-only';
  const accounts = [
    { id: 1, role: 'QuanTriVien', active: true }, { id: 2, role: 'NguoiChamSoc', active: true, elderlyId: 7 },
    { id: 3, role: 'NguoiCaoTuoi', active: true, elderlyId: 7 }, { id: 4, role: 'NguoiCaoTuoi', active: true, elderlyId: 8 },
    ...[10, 11, 12, 13, 14].map(id => ({ id, role: 'NguoiThan', active: id !== 13, permission: id !== 14 })),
  ];
  const links = [{ userId: 10, elderlyId: 7 }, { userId: 10, elderlyId: 8 }, { userId: 11, elderlyId: 7 },
    { userId: 12, elderlyId: 8 }, { userId: 13, elderlyId: 7 }, { userId: 14, elderlyId: 7 }].map(link => ({ ...link, consent: true, revoked: false }));
  const state = { fixtureOnly: true, schema: true, committed: 0, sos: [], notifications: [], queries: [], events: [], requests: [], errors: [], revokeBeforeEmit: null };
  const allowed = (userId, elderlyId) => accounts.some(a => a.id === Number(userId) && a.active && a.role === 'NguoiThan' && a.permission !== false)
    && links.some(l => l.userId === Number(userId) && l.elderlyId === Number(elderlyId) && l.consent && !l.revoked);
  const name = id => `NCT fixture ${id === 7 ? 'An' : 'Bình'}`;
  const profile = id => ({ id, hoTen: name(id), tuoi: 74, gioiTinh: 'Nam', nhomMau: 'O+', trangThai: 'DangTheoDoi', moiQuanHe: 'Con gái', xemBenhNen: false, xemDiUng: false, xemKetQuaKham: false });
  const checkScope = text => {
    assert.match(text, /lk\.ThuHoiLuc IS NULL/); assert.match(text, /lk\.DongYChiaSe=1/);
    assert.match(text, /nd\.TrangThai=N'HoatDong'/); assert.match(text, /vt\.TenVaiTro=N'NguoiThan'/);
    assert.match(text, /pq\.ChoPhepXem=1/);
  };
  class Transaction {
    async begin() { this.before = JSON.parse(JSON.stringify({ sos: state.sos, notifications: state.notifications })); }
    async commit() { state.committed++; }
    async rollback() { if (this.before) Object.assign(state, this.before); }
  }
  class Request {
    constructor() { this.values = {}; }
    input(key, _type, value) { this.values[key] = value; return this; }
    async query(text) {
      const p = this.values; state.queries.push({ text, values: { ...p } });
      if (text.includes(' AS ready')) return { recordset: [{ ready: state.schema ? 1 : 0 }] };
      if (text.includes('WHERE nd.UserID=@userId')) {
        const a = accounts.find(item => item.id === p.userId);
        return { recordset: a ? [{ VaiTroID: roleId(a.role), TenVaiTro: a.role, TrangThai: a.active ? 'HoatDong' : 'BiKhoa' }] : [] };
      }
      if (text.includes('FROM HoSoNguoiCaoTuoi WHERE UserID')) {
        const a = accounts.find(item => item.id === p.userId && item.role === 'NguoiCaoTuoi');
        return { recordset: a ? [{ id: a.elderlyId, name: name(a.elderlyId) }] : [] };
      }
      if (text.includes('FROM CanhBaoKhanCap sos WITH')) return { recordset: [] }; // Each fixture send is a separate synthetic SOS.
      if (text.includes('INSERT INTO CanhBaoKhanCap')) {
        const row = { id: 101 + state.sos.length, elderlyId: p.elderlyId, ngayGui: new Date().toISOString(), trangThai: 'DangGui', viDo: p.viDo, kinhDo: p.kinhDo };
        state.sos.push(row); return { recordset: [row] };
      }
      if (text.includes('INSERT INTO CanhBao (')) { const row = state.sos.find(s => s.id === p.emergencyId); row.alertId = row.id + 1000; return { recordset: [{ id: row.alertId }] }; }
      if (text.includes('SELECT DISTINCT nd.UserID AS userId')) return { recordset: accounts.filter(a => a.active && (a.role === 'QuanTriVien' || a.role === 'NguoiChamSoc' && a.elderlyId === p.elderlyId)).map(a => ({ userId: a.id, role: a.role })) };
      if (text.includes('INSERT INTO ThongBao(')) {
        const row = { id: state.notifications.length + 1, userId: p.userId, sosId: p.sourceId, content: p.content };
        state.notifications.push(row); return { recordset: [row] };
      }
      if (text.includes('SELECT sos.CanhBaoKhanCapID AS id FROM')) return { recordset: state.sos.filter(s => s.elderlyId === p.elderlyId && (p.sosId != null ? s.id === p.sosId : s.alertId === p.alertId)).map(s => ({ id: s.id })) };
      if (text.includes('SELECT DISTINCT lk.NguoiThanUserID AS userId')) { checkScope(text); return { recordset: accounts.filter(a => allowed(a.id, p.elderlyId)).map(a => ({ userId: a.id })) }; }
      if (text.includes('DECLARE @notificationId')) {
        checkScope(text); assert.match(text, /UPDLOCK,HOLDLOCK/); assert.match(text, /ROLLBACK TRANSACTION/); assert.ok(state.committed > 0, 'No family write before original SOS commit');
        let row = state.notifications.find(n => n.userId === p.userId && n.sosId === p.sosId);
        if (allowed(p.userId, p.elderlyId) && !row) { row = { id: state.notifications.length + 1, userId: p.userId, sosId: p.sosId, content: 'Người cao tuổi đã gửi SOS.' }; state.notifications.push(row); }
        if (state.revokeBeforeEmit === p.userId) { links.find(l => l.userId === p.userId && l.elderlyId === p.elderlyId).revoked = true; state.revokeBeforeEmit = null; }
        return { recordset: [{ id: row?.id || null }] };
      }
      if (text.includes('SELECT sos.CanhBaoKhanCapID AS id,nct.HoTen')) {
        checkScope(text); assert.match(text, /lk\.NguoiThanUserID=@userId/);
        const s = state.sos.find(s => s.id === p.sosId && s.elderlyId === p.elderlyId);
        return { recordset: s && allowed(p.userId, p.elderlyId) ? [{ id: s.id, name: name(s.elderlyId), time: s.ngayGui, status: s.trangThai, alertId: s.alertId }] : [] };
      }
      if (text.includes('SELECT lk.LienKetID')) { checkScope(text); return { recordset: allowed(p.userId, p.elderlyId) ? [{ LienKetID: 1 }] : [] }; }
      if (text.includes('tb.ThongBaoID AS id')) {
        checkScope(text); assert.match(text, /tb.UserID=lk.NguoiThanUserID/);
        return { recordset: state.notifications.filter(n => n.userId === p.userId).flatMap(n => {
          const s = state.sos.find(s => s.id === n.sosId); return s && allowed(p.userId, s.elderlyId) ? [{ id: n.id, nguoiCaoTuoiId: s.elderlyId, canhBaoKhanCapId: s.id, tieuDe: 'Cảnh báo SOS', noiDung: 'Người cao tuổi đã gửi SOS.', ngayTao: s.ngayGui, daDoc: false }] : [];
        }) };
      }
      if (text.includes('SELECT s.CanhBaoKhanCapID AS id')) {
        checkScope(text); return { recordset: allowed(p.userId, p.elderlyId) ? state.sos.filter(s => s.elderlyId === p.elderlyId).reverse().slice(p.offset || 0, (p.offset || 0) + p.limit).map(s => ({ id: s.id, nguoiCaoTuoiId: s.elderlyId, ngayGui: s.ngayGui, trangThai: s.trangThai, ngayXuLy: null, noiDung: 'Người cao tuổi đã gửi SOS.' })) : [] };
      }
      if (text.includes('nct.NguoiCaoTuoiID AS id')) { checkScope(text); return { recordset: [7, 8].filter(id => allowed(p.userId, id) && (!p.elderlyId || id === p.elderlyId)).map(profile) }; }
      if (text.includes('dbo.NguoiCaoTuoi_NguoiThan lk')) { checkScope(text); return { recordset: [] }; }
      throw new Error(`Unrecognized RAM SQL: ${text.slice(0, 65)}`);
    }
  }
  const sql = { Int: 'Int', Date: 'Date', VarChar: () => 'VarChar', NVarChar: () => 'NVarChar', Decimal: () => 'Decimal', Request, Transaction, ISOLATION_LEVEL: { SERIALIZABLE: 'Serializable' } };
  const pool = { request: () => new Request() }, db = { sql, poolPromise: Promise.resolve(pool) };
  const roleId = role => ({ QuanTriVien: 1, NguoiChamSoc: 2, NguoiCaoTuoi: 3, NguoiThan: 4 }[role]);
  const load = (file, overrides = {}) => {
    const filename = path.resolve(__dirname, '../../src', file), module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, process: { env: { JWT_SECRET: secret } },
      console: { error: (...args) => state.errors.push(args) },
      require: name => overrides[name] || (name.endsWith('/config/db') ? db : createRequire(filename)(name)),
    }, { filename }); return module.exports;
  };
  const respond = (res, status, data, code) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(code ? { success: false, message: 'Fixture request denied', errorCode: code } : { success: true, data })); };
  const token = userId => { const a = accounts.find(a => a.id === userId); return jwt.sign({ userId, vaiTroId: roleId(a.role), tenVaiTro: a.role, sessionVersion: 2 }, secret, { expiresIn: '12h' }); };
  const server = http.createServer(async (req, res) => {
    if (!req.url.startsWith('/api/')) { if (fallback) return fallback(req, res); return respond(res, 404, null, 'FIXTURE_ONLY'); }
    try {
      const url = new URL(req.url, 'http://fixture'), route = url.pathname;
      const decoded = jwt.verify(req.headers.authorization?.replace('Bearer ', ''), secret);
      const a = accounts.find(a => a.id === decoded.userId && a.role === decoded.tenVaiTro && a.active);
      if (!a) return respond(res, 401, null, 'INVALID_TOKEN');
      state.requests.push({ method: req.method, path: route, userId: a.id });
      if (a.role === 'NguoiThan' && !allowedRelativeRequest({ method: req.method, originalUrl: route })) return respond(res, 403, null, 'FORBIDDEN');
      if (route === '/api/auth/me') return respond(res, 200, { userId: a.id, tenVaiTro: a.role, hoTen: `Tài khoản fixture ${a.id}` });
      if (route === '/api/permissions/me') return respond(res, 200, READ_FEATURES.map(maChucNang => ({ maChucNang, xem: a.permission !== false, them: false, sua: false, xoa: false })));
      const reads = createRelativeReadRepository(pool, sql);
      if (a.role === 'NguoiThan' && route === '/api/relatives/me/elderly') return respond(res, 200, await reads.elderly(a.id, Object.fromEntries(url.searchParams)));
      if (a.role === 'NguoiThan' && route === '/api/relatives/me/notifications') return respond(res, 200, await reads.notifications(a.id));
      const match = route.match(/^\/api\/relatives\/me\/elderly\/(\d+)(?:\/([a-z-]+))?$/);
      if (a.role === 'NguoiThan' && match) {
        const section = { 'health-metrics': 'health', 'medication-schedules': 'medications', appointments: 'appointments', alerts: 'alerts', sos: 'sos' }[match[2]] || (!match[2] && 'profile');
        return respond(res, 200, await reads.read(a.id, Number(match[1]), section, Object.fromEntries(url.searchParams)));
      }
      if (route === '/api/emergency-alerts' && req.method === 'POST') {
        let body = ''; for await (const chunk of req) body += chunk;
        const adapted = { statusCode: 200, end() {} };
        const result = await send(a.id, JSON.parse(body || '{}')); return respond(res, result.statusCode, result.data);
      }
      return respond(res, 405, null, 'FIXTURE_ONLY');
    } catch (error) { return respond(res, error.status || 401, null, error.code || 'FIXTURE_DENIED'); }
  });
  const sockets = load('socket.js', { './config/db': db, './middlewares/cors.middleware': { isAllowedOrigin: () => true } });
  const io = sockets.initSocket(server);
  const tracedSocket = { ...sockets, emitToUser(userId, event, data) {
    assert.ok(state.committed > 0 || event === 'relatives:access-changed'); state.events.push({ userId, event, data }); return sockets.emitToUser(userId, event, data);
  } };
  const notifications = load('services/alertNotification.service.js', { '../config/db': db, '../socket': tracedSocket });
  const controller = load('controllers/emergencyAlert.controller.js', { '../config/db': db, '../socket': tracedSocket,
    '../services/alertNotification.service': notifications, '../middlewares/mobile-scope.middleware': { scopedWhere: () => '' },
    '../services/alertWorkflow.service': { endpoint: () => () => {} },
    '../utils/response': { ok: (res, data, _message, status = 200) => { res.statusCode = status; res.data = data; return data; }, fail: (_res, _message, code, status) => { throw Object.assign(new Error(code), { code, status }); } } });
  const send = async (userId = 3, body = {}) => {
    const a = accounts.find(a => a.id === userId), res = {};
    await controller.create({ user: { userId, tenVaiTro: a.role }, body: { noiDung: 'PRIVATE_INTERNAL + GPS', viDo: 10.75, kinhDo: 106.67, ...body } }, res, error => { throw error; });
    await new Promise(resolve => setImmediate(resolve));
    // Wait for the deliberately post-commit async helper, without a database.
    for (let attempt = 0; attempt < 20 && !state.events.some(e => e.event === 'canhbao:new' && e.data.canhBaoKhanCapId === res.data?.id); attempt++) await new Promise(resolve => setImmediate(resolve));
    return res;
  };
  return { state, accounts, links, pool, sql, sockets, io, server, token, allowed, notifications, send,
    async start(port = 0) { await new Promise(resolve => server.listen(port, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; },
    async stop() { await io.close(); },
    revoke(userId, elderlyId) { links.find(l => l.userId === userId && l.elderlyId === elderlyId).revoked = true; sockets.emitToUser(userId, 'relatives:access-changed', { nguoiCaoTuoiId: elderlyId, action: 'THU_HOI' }); },
  };
}
module.exports = { createFixture };
