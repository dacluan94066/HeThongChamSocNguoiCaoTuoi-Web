// Opt-in integration against the ONE already approved Stage6 DB. No schema,
// account, profile, historical-dose writes or worker startup. Synthetic new
// doses remain for inspection; this test never creates/drops a database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { createRequire } = require('node:module');

test('Stage6 SQL: legacy status concurrency and medication regressions', {
  skip: process.env.CARESENIOR_MEDICATION_STAGE6 !== '1', timeout: 120000,
}, async t => {
  const sql = require('mssql'), jwt = require('jsonwebtoken');
  const env = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
  const database = 'CareSeniorRelativesTest_Stage6_20261027';
  const instance = 'DESKTOP-4FJVTFU\\SQLEXPRESS';
  const pools = [], servers = [], events = [], created = [], checks = [];
  const secretBefore = process.env.JWT_SECRET;
  const secret = 'stage61-medication-only-isolated-jwt';
  process.env.JWT_SECRET = secret;
  let guardCount = 0, gate;
  const RawRequest = sql.Request;
  async function ensure(pool) {
    const row = (await new RawRequest(pool).query('SELECT @@SERVERNAME AS instance, DB_NAME() AS db, @@SPID AS spid')).recordset[0];
    assert.equal(row.instance, instance); assert.equal(row.db, database); guardCount++;
    return row;
  }
  class GuardRequest extends RawRequest {
    constructor(parent) { super(parent); this.target = parent; }
    async query(statement) {
      assert.doesNotMatch(statement, /\b(?:USE\s|CREATE\s+DATABASE|DROP\s|TRUNCATE\s|ALTER\s+DATABASE)/i);
      await ensure(this.target);
      const result = await super.query(statement);
      if (gate && statement.includes('AS previousStatus') && !statement.includes('UPDATE LichUongThuoc')) await gate.arrive();
      return result;
    }
  }
  class GuardTransaction extends sql.Transaction {
    async begin(level) { await ensure(this.parent); return super.begin(level); }
  }
  async function query(statement, values = {}) {
    const r = pools[0].request(); for (const [key, value] of Object.entries(values)) r.input(key, value);
    return r.query(statement);
  }
  function loadApp(pool) {
    const cache = new Map(), src = path.resolve(__dirname, '../src');
    const load = file => {
      file = path.resolve(file); if (!file.endsWith('.js')) file += '.js';
      if (file === path.join(src, 'config/db.js')) return { sql: { ...sql, Request: GuardRequest, Transaction: GuardTransaction }, poolPromise: Promise.resolve(pool) };
      if (file === path.join(src, 'socket.js')) return { emitToAdmin: (...args) => events.push(args), emitToUser: (...args) => events.push(args) };
      if (file === path.join(src, 'config/mailer.js')) return { sendMail: async () => { throw Error('External mail prohibited'); } };
      if (cache.has(file)) return cache.get(file).exports;
      assert.ok(file.startsWith(src + path.sep));
      const module = { exports: {} }, local = createRequire(file); cache.set(file, module);
      vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(file, 'utf8')}\n})`, { filename: file })(
        name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : local(name), module, module.exports);
      return module.exports;
    };
    // Real JWT, role, scope and routes; no server.js/Socket.IO startup/workers.
    const express = require('express'), app = express(); app.use(express.json());
    app.use('/api/medication-schedules', load(path.join(src, 'routes/lichUongThuoc.routes.js')));
    app.use('/api/medication-schedule', load(path.join(src, 'routes/medicationSchedule.routes.js')));
    const own = express.Router();
    own.use(load(path.join(src, 'middlewares/auth.middleware.js')));
    own.get('/', load(path.join(src, 'controllers/lichUongThuoc.controller.js')).getMine);
    app.use('/api/elderly/me/medication-schedule', own);
    app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
    return app;
  }
  const token = (userId, tenVaiTro, vaiTroId) => jwt.sign({ userId, tenVaiTro, vaiTroId, sessionVersion: 2 }, secret, { expiresIn: '5m' });
  const actors = { admin: token(1, 'QuanTriVien', 1), caregiver: token(3, 'NguoiChamSoc', 2),
    elder: token(2, 'NguoiCaoTuoi', 3), relative: token(5, 'NguoiThan', 4), otherElder: token(8, 'NguoiCaoTuoi', 3) };
  async function call(client, method, url, actor, body) {
    const res = await fetch(`http://127.0.0.1:${servers[client].address().port}/api${url}`, {
      method, headers: { Authorization: `Bearer ${actors[actor]}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    return { status: res.status, ...await res.json() };
  }
  const mutate = (client, id, state, actor = 'elder', route = 'status') => call(client, 'PATCH',
    route === 'status' ? `/medication-schedules/${id}/status` : `/medication-schedule/${id}/confirm`, actor, { trangThai: state });
  async function dose(state = 'ChuaDenGio', days = 0) {
    const row = (await query(`INSERT INTO LichUongThuoc(DonThuocChiTietID,NguoiCaoTuoiID,ThoiGianDuKien,TrangThai,GhiChu)
      OUTPUT INSERTED.LichUongThuocID AS id
      VALUES(1,1,DATEADD(DAY,@days,DATEADD(HOUR,7,SYSUTCDATETIME())),@state,N'STAGE61_MEDICATION_CONCURRENCY_SYNTHETIC')`, { days, state })).recordset[0];
    created.push(row.id); return row.id;
  }
  async function stored(id) {
    return (await query(`SELECT TrangThai AS state,CONVERT(VARCHAR(27),ThoiGianThucTe,126) AS actual,
      NguoiXacNhanID AS actor FROM LichUongThuoc WHERE LichUongThuocID=@id`, { id })).recordset[0];
  }
  async function race(id, a, b, routeA = 'status', routeB = 'status') {
    // Deterministic interleaving: both independent SQL sessions have completed
    // their real SELECT before either executes its real UPDATE. No mocked SQL.
    let arrivals = 0, release, timer;
    const wait = new Promise((resolve, reject) => { release = resolve; timer = setTimeout(() => reject(Error('Both SQL reads did not reach barrier')), 10000); });
    gate = { async arrive() { if (++arrivals === 2) { clearTimeout(timer); release(); } await wait; } };
    try {
      const responses = await Promise.all([mutate(0, id, a, 'elder', routeA), mutate(1, id, b, 'elder', routeB)]);
      assert.equal(arrivals, 2); assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      assert.equal(responses.find(r => r.status === 409).errorCode, 'DOSE_CHANGED');
      const winner = responses[0].status === 200 ? a : b, row = await stored(id);
      assert.equal(row.state, winner); assert.equal(Boolean(row.actual), winner === 'DaUong');
      return { id, responses: responses.map(r => r.status), final: row };
    } finally { clearTimeout(timer); gate = null; }
  }
  async function check(name, fn) {
    await t.test(name, async () => {
      try { const evidence = await fn(); checks.push({ name, result: 'PASS', evidence }); }
      catch (error) { checks.push({ name, result: 'FAIL', message: error.message }); throw error; }
    });
  }
  try {
    for (let i = 0; i < 2; i++) {
      const pool = await new sql.ConnectionPool({ server: env.DB_SERVER || 'localhost', port: Number(env.DB_PORT) || 1433,
        user: env.DB_USER, password: env.DB_PASSWORD, database, pool: { min: 1, max: 1 },
        connectionTimeout: 10000, requestTimeout: 15000,
        options: { encrypt: env.DB_ENCRYPT === 'true', trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE === 'true' },
      }).connect();
      pools.push(pool); pool.request = () => new GuardRequest(pool);
    }
    const targets = await Promise.all(pools.map(ensure)); assert.notEqual(targets[0].spid, targets[1].spid);
    const users = (await query('SELECT UserID,TenDangNhap,TrangThai FROM NguoiDung WHERE UserID IN (1,2,3,5)')).recordset;
    assert.equal(users.length, 4);
    for (const u of users) assert.ok(u.TenDangNhap.startsWith('fixture.') && u.TrangThai === 'HoatDong');
    const profile = (await query('SELECT UserID FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID=1')).recordset[0]; assert.equal(profile.UserID, 2);
    const before = (await query(`SELECT LichUongThuocID,TrangThai,ThoiGianDuKien,ThoiGianThucTe,NguoiXacNhanID,GhiChu FROM LichUongThuoc ORDER BY LichUongThuocID`)).recordset;
    for (const pool of pools) {
      const server = http.createServer(loadApp(pool)); servers.push(server);
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    }
    await check('two real independent SQL sessions target only approved Stage6', async () => targets);
    await check('FAIL A regression: repeat taken and taken-to-missed/refused preserve time and confirmer', async () => {
      const id = await dose(); assert.equal((await mutate(0, id, 'DaUong', 'admin')).status, 200);
      const original = await stored(id), eventCount = events.length;
      for (const state of ['DaUong', 'BoLo', 'TuChoi']) {
        const response = await mutate(1, id, state, 'caregiver'); assert.equal(response.status, 409); assert.equal(response.errorCode, 'DOSE_CHANGED');
        assert.deepEqual(await stored(id), original);
      }
      assert.equal(events.length, eventCount); return { id, original, final: await stored(id) };
    });
    for (const [a, b] of [['DaUong', 'BoLo'], ['BoLo', 'DaUong'], ['DaUong', 'DaUong'], ['BoLo', 'BoLo']]) {
      await check(`FAIL B regression: concurrent status ${a}/${b}`, async () => race(await dose(), a, b));
    }
    for (const [a, b] of [['status', 'confirm'], ['confirm', 'status'], ['confirm', 'confirm']]) {
      await check(`cross-endpoint ${a}/${b} competes on same SQL state`, async () => race(await dose(), 'DaUong', 'BoLo', a, b));
    }
    for (const previous of ['BoLo', 'TuChoi']) {
      await check(`late same-day ${previous} -> DaUong still valid, repeat conflicts`, async () => {
        const id = await dose(previous); assert.equal((await mutate(0, id, 'DaUong', 'caregiver')).status, 200);
        const original = await stored(id); assert.equal((await mutate(1, id, 'DaUong', 'elder', 'confirm')).status, 409);
        assert.deepEqual(await stored(id), original); return { id, final: original };
      });
    }
    await check('four roles: Admin/assigned caregiver/own NCT allowed, relatives and foreign NCT denied', async () => {
      const ids = [];
      for (const actor of ['admin', 'caregiver', 'elder']) {
        const id = await dose(); ids.push(id); const response = await mutate(0, id, 'DA_UONG', actor);
        assert.equal(response.status, 200); assert.equal(response.data.trangThai, 'DA_UONG'); assert.equal(response.data.trangThaiDb, 'DaUong');
      }
      const denied = await dose();
      for (const actor of ['relative', 'otherElder']) assert.equal((await mutate(1, denied, 'DaUong', actor)).status, 403);
      assert.equal((await stored(denied)).state, 'ChuaDenGio'); return { acceptedDoseIds: ids, deniedDoseId: denied };
    });
    await check('invalid status and past/future dates still rejected before writes', async () => {
      const ids = [];
      for (const days of [-1, 1]) {
        const id = await dose('ChuaDenGio', days); ids.push(id);
        const response = await mutate(0, id, 'DaUong'); assert.equal(response.status, 422); assert.equal(response.errorCode, 'NOT_TODAY');
        assert.equal((await stored(id)).state, 'ChuaDenGio');
      }
      const id = await dose(); const response = await mutate(0, id, 'unknown'); assert.equal(response.status, 422);
      assert.equal((await stored(id)).state, 'ChuaDenGio'); return { ids, invalidDoseId: id };
    });
    await check('past-day supplement still creates one audit and status endpoint cannot overwrite it', async () => {
      assert.equal((await query("SELECT CASE WHEN OBJECT_ID(N'dbo.LichSuGhiNhanUongThuoc',N'U') IS NULL THEN 0 ELSE 1 END AS ready")).recordset[0].ready, 1);
      const id = await dose('BoLo', -1);
      const wall = (await query('SELECT CONVERT(VARCHAR(19),ThoiGianDuKien,126) AS wall FROM LichUongThuoc WHERE LichUongThuocID=@id', { id })).recordset[0].wall;
      const body = { thoiGianThucTe: `${wall}+07:00`, lyDo: 'STAGE61 synthetic already taken; no real medication' };
      assert.equal((await call(0, 'PATCH', `/medication-schedule/${id}/supplement`, 'elder', body)).status, 200);
      const original = await stored(id);
      assert.equal((await call(1, 'PATCH', `/medication-schedule/${id}/supplement`, 'elder', body)).status, 409);
      assert.equal((await mutate(1, id, 'BoLo', 'admin')).status, 422); assert.deepEqual(await stored(id), original);
      assert.equal((await query('SELECT COUNT(*) AS n FROM LichSuGhiNhanUongThuoc WHERE LichUongThuocID=@id', { id })).recordset[0].n, 1);
      return { id, actual: original.actual, audits: 1 };
    });
    await check('Web and Mobile lists agree on synthetic doses and daily completed/total counts', async () => {
      const staff = await call(0, 'GET', '/medication-schedules?nguoiCaoTuoiId=1', 'admin');
      const mobile = await call(1, 'GET', '/elderly/me/medication-schedule', 'elder');
      assert.equal(staff.status, 200); assert.equal(mobile.status, 200);
      const own = mobile.data.filter(r => created.includes(r.id));
      for (const row of own) {
        const other = staff.data.find(r => r.id === row.id); assert.ok(other);
        assert.equal(other.thoiGianThucTe, row.thoiGianThucTe);
        assert.equal(other.trangThaiHom_nay, ({ DaUong: 'DA_UONG', BoLo: 'BO_LO', TuChoi: 'TU_CHOI', ChuaDenGio: 'CHUA_DEN_GIO' })[row.trangThai]);
      }
      return { todayDoses: own.length, completed: own.filter(r => r.trangThai === 'DaUong').length };
    });
    await check('all pre-existing Stage6 doses unchanged; no historical timestamp edits', async () => {
      const all = (await query('SELECT LichUongThuocID,TrangThai,ThoiGianDuKien,ThoiGianThucTe,NguoiXacNhanID,GhiChu FROM LichUongThuoc ORDER BY LichUongThuocID')).recordset;
      assert.deepEqual(all.filter(r => !created.includes(r.LichUongThuocID)), before);
      return { preExistingPreserved: before.length, createdDoseIds: created };
    });
  } finally {
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    for (const pool of pools) await pool.close();
    if (secretBefore === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secretBefore;
    if (process.env.CARESENIOR_MEDICATION_EVIDENCE) {
      fs.writeFileSync(process.env.CARESENIOR_MEDICATION_EVIDENCE, JSON.stringify({ instance, database, guardCount, checks, createdDoseIds: created }, null, 2));
    }
  }
});
