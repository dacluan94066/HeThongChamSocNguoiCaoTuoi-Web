const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('Stage6 appointment mutations: independent SQL connections, no workers/external delivery', {
  skip: process.env.CARESENIOR_APPOINTMENT_STAGE6 !== '1', timeout: 60000,
}, async t => {
  require('./stage6-test-safety.cjs').forbidLiveDbImport(t);
  const sql = require('mssql'), Raw = sql.Request;
  const env = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
  const database = 'CareSeniorRelativesTest_Stage6_20261027', instance = 'DESKTOP-4FJVTFU\\SQLEXPRESS';
  const pools = [], events = [], marker = `HIGH_FIX_AUD07_${Date.now()}`;
  let barrier, guardCount = 0, fixtureId;
  const ensure = async pool => {
    const row = (await new Raw(pool).query('SELECT @@SERVERNAME AS instance,DB_NAME() AS db')).recordset[0];
    assert.equal(row.instance, instance); assert.equal(row.db, database); guardCount++;
  };
  class Request extends Raw {
    constructor(pool) { super(pool); this.target = pool; }
    async query(statement) {
      await ensure(this.target);
      assert.doesNotMatch(statement, /\b(?:USE\s|CREATE\s+DATABASE|DROP\s|TRUNCATE\s|ALTER\s)/i);
      const result = await super.query(statement);
      if (this.target === pools[0] && barrier && statement.includes('TrangThai AS trangThai')
        && statement.includes('WHERE LichKhamID=@id') && !statement.includes('UPDATE')) {
        const hold = barrier; barrier = null; hold.reached(); await hold.wait;
      }
      return result;
    }
  }
  const controller = pool => {
    const db = { poolPromise: Promise.resolve(pool), sql };
    const scopeFile = path.resolve(__dirname, '../src/middlewares/mobile-scope.middleware.js');
    const scope = { exports: {} }, scopeLocal = createRequire(scopeFile);
    vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(scopeFile, 'utf8')}\n})`, { filename: scopeFile })(
      name => name === '../config/db' ? db : scopeLocal(name), scope, scope.exports);
    const filename = path.resolve(__dirname, '../src/controllers/lichKhamBenh.controller.js');
    const module = { exports: {} }, local = createRequire(filename);
    vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(name => ({
      '../config/db': db,
      '../middlewares/mobile-scope.middleware': scope.exports,
      '../socket': { emitToAdmin: (...args) => events.push(args), emitToUser: (...args) => events.push(args) },
    }[name] || local(name)), module, module.exports);
    return module.exports;
  };
  const call = async (pool, method, body = {}) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await controller(pool)[method]({ params: { id: String(fixtureId) }, body,
      user: { userId: 1, tenVaiTro: 'QuanTriVien' } }, res, error => { throw error; });
    return res;
  };
  try {
    for (let i = 0; i < 2; i++) {
      const pool = await new sql.ConnectionPool({ server: env.DB_SERVER || 'localhost', port: Number(env.DB_PORT) || 1433,
        user: env.DB_USER, password: env.DB_PASSWORD, database, pool: { min: 1, max: 1 }, requestTimeout: 15000,
        options: { encrypt: env.DB_ENCRYPT === 'true', trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE === 'true' },
      }).connect();
      pools.push(pool); await ensure(pool); pool.request = () => new Request(pool);
    }
    const p = pools[1];
    const users = (await p.request().query("SELECT CASE WHEN TenDangNhap LIKE 'fixture.%' THEN 1 ELSE 0 END AS fixture FROM NguoiDung WHERE UserID IN(1,2)")).recordset;
    assert.equal(users.length, 2); assert.ok(users.every(row => row.fixture === 1));
    assert.equal((await p.request().query('SELECT UserID FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID=1')).recordset[0].UserID, 2);
    const before = (await p.request().query('SELECT * FROM LichKhamBenh ORDER BY LichKhamID')).recordset;
    const day = (await p.request().query('SELECT CONVERT(CHAR(10),DATEADD(DAY,3,DATEADD(HOUR,7,SYSUTCDATETIME())),23) AS day')).recordset[0].day;
    fixtureId = (await p.request().input('marker', sql.NVarChar, marker).input('time', sql.VarChar, `${day}T08:00:00`).query(`
      INSERT INTO LichKhamBenh(NguoiCaoTuoiID,TenBenhVien,ThoiGianKham,TrangThai,NguoiTaoID)
      OUTPUT INSERTED.LichKhamID AS id VALUES(1,@marker,CONVERT(DATETIME2,@time,126),N'ChuaDen',1)`)).recordset[0].id;
    const reset = async (status = 'ChuaDen') => p.request().input('id', sql.Int, fixtureId)
      .input('status', sql.NVarChar, status).input('time', sql.VarChar, `${day}T08:00:00`).query(`
        UPDATE LichKhamBenh SET TrangThai=@status,ThoiGianKham=CONVERT(DATETIME2,@time,126),KetQuaKham=NULL WHERE LichKhamID=@id`);
    const row = async () => (await p.request().input('id', sql.Int, fixtureId).query(`
      SELECT TrangThai AS status,CONVERT(VARCHAR(33),ThoiGianKham,126) AS time,KetQuaKham AS result FROM LichKhamBenh WHERE LichKhamID=@id`)).recordset[0];
    const body = hour => ({ nguoiCaoTuoiId: 1, ngayKham: day, gioKham: hour, noiKham: marker });
    const pauseRead = () => {
      let reached, release; const ready = new Promise(resolve => { reached = resolve; });
      const wait = new Promise(resolve => { release = resolve; });
      barrier = { reached, wait, release }; return { ready, release };
    };
    await t.test('cancel wins: stale edit returns 409, cannot revive Huy, creates no reschedule event', async () => {
      const hold = pauseRead(), pending = call(pools[0], 'update', body('10:00'));
      await hold.ready; const cancel = await call(p, 'cancel'); const afterCancel = await row(), count = events.length;
      hold.release(); const stale = await pending;
      assert.equal(cancel.statusCode, 200); assert.equal(stale.statusCode, 409);
      assert.equal(stale.body.errorCode, 'APPOINTMENT_CHANGED'); assert.deepEqual(await row(), afterCancel);
      assert.equal((await row()).status, 'Huy'); assert.equal(events.length, count);
    });
    await t.test('two reschedules: only the winning edit changes time and emits notifications', async () => {
      await reset(); const hold = pauseRead(), pending = call(pools[0], 'update', body('10:00'));
      await hold.ready; const winner = await call(p, 'update', body('11:00')); const count = events.length;
      hold.release(); const stale = await pending;
      assert.equal(winner.statusCode, 200); assert.equal(stale.statusCode, 409);
      assert.match((await row()).time, /T11:00:00/); assert.equal(events.length, count);
    });
    await t.test('unchanged-time metadata edit of canceled record preserves intentional existing behavior', async () => {
      await reset('Huy'); const res = await call(p, 'update', body('08:00'));
      assert.equal(res.statusCode, 200); assert.equal((await row()).status, 'Huy');
    });
    await t.test('recorded result wins over a pending metadata edit; DaKham and result remain intact', async () => {
      await reset();
      const past = (await p.request().query('SELECT CONVERT(CHAR(10),DATEADD(DAY,-1,DATEADD(HOUR,7,SYSUTCDATETIME())),23) AS day')).recordset[0].day;
      await p.request().input('id', sql.Int, fixtureId).input('time', sql.VarChar, `${past}T08:00:00`)
        .query('UPDATE LichKhamBenh SET ThoiGianKham=CONVERT(DATETIME2,@time,126) WHERE LichKhamID=@id');
      const hold = pauseRead(), pending = call(pools[0], 'update', { ...body('08:00'), ngayKham: past });
      await hold.ready; const winner = await call(p, 'recordResult', { ketQuaKham: 'KẾT QUẢ GIẢ KIỂM THỬ' });
      const completed = await row(), count = events.length; hold.release(); const stale = await pending;
      assert.equal(winner.statusCode, 200); assert.equal(stale.statusCode, 409);
      assert.deepEqual(await row(), completed); assert.equal(completed.status, 'DaKham');
      assert.equal(completed.result, 'KẾT QUẢ GIẢ KIỂM THỬ'); assert.equal(events.length, count);
    });
    await t.test('optimistic comparison accepts the original datetime2 fractional precision', async () => {
      await reset(); await p.request().input('id', sql.Int, fixtureId).input('time', sql.VarChar, `${day}T08:00:00.1234567`)
        .query('UPDATE LichKhamBenh SET ThoiGianKham=CONVERT(DATETIME2(7),@time,126) WHERE LichKhamID=@id');
      assert.equal((await call(p, 'update', body('08:00'))).statusCode, 200);
    });
    await t.test('normal reschedule succeeds, pending status and readable precision are preserved', async () => {
      await reset(); const res = await call(p, 'update', body('12:00'));
      assert.equal(res.statusCode, 200); assert.equal((await row()).status, 'ChuaDen'); assert.match((await row()).time, /T12:00:00/);
      assert.deepEqual((await p.request().query(`SELECT * FROM LichKhamBenh WHERE LichKhamID<>${fixtureId} ORDER BY LichKhamID`)).recordset, before);
    });
    t.diagnostic(JSON.stringify({ instance, database, fixtureId, marker, guardCount, externalDeliveries: 0, existingAppointments: before.length }));
  } finally {
    barrier?.release(); for (const pool of pools) await pool.close();
  }
});
