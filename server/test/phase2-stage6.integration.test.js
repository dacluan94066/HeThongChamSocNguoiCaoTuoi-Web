const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('Phase2: guarded real SQL Stage6; no server, worker or external deliveries', {
  skip: process.env.CARESENIOR_PHASE2_STAGE6 !== '1', timeout: 90000,
}, async t => {
  require('./stage6-test-safety.cjs').forbidLiveDbImport(t);
  const sql = require('mssql'), RawRequest = sql.Request;
  const env = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
  const database = 'CareSeniorRelativesTest_Stage6_20261027', instance = 'DESKTOP-4FJVTFU\\SQLEXPRESS';
  let guards = 0, pool;
  async function ensure(connection) {
    const row = (await new RawRequest(connection).query('SELECT @@SERVERNAME AS instance,DB_NAME() AS db')).recordset[0];
    assert.equal(row.instance, instance); assert.equal(row.db, database); guards++;
  }
  class Request extends RawRequest {
    constructor(parent) { super(parent); this.target = parent; }
    async query(statement) {
      await ensure(this.target);
      assert.doesNotMatch(statement, /\b(?:USE\s|CREATE\s+DATABASE|DROP\s|TRUNCATE\s|ALTER\s)/i);
      return super.query(statement);
    }
  }
  const load = (relative, stubs) => {
    const filename = path.resolve(__dirname, relative), module = { exports: {} }, local = createRequire(filename);
    vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(
      name => stubs[name] || local(name), module, module.exports);
    return module.exports;
  };
  const call = async (handler, body) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ user: { userId: 1, tenVaiTro: 'QuanTriVien' }, params: {}, query: {}, body }, res, e => { throw e; });
    return res;
  };
  const inTransaction = async fn => {
    await ensure(pool); const tx = new sql.Transaction(pool); await tx.begin();
    const view = { request: () => new Request(tx) };
    try { return await fn(view, tx); } finally { await tx.rollback(); }
  };
  try {
    pool = await new sql.ConnectionPool({ server: env.DB_SERVER || 'localhost', port: Number(env.DB_PORT) || 1433,
      user: env.DB_USER, password: env.DB_PASSWORD, database, connectionTimeout: 10000, requestTimeout: 15000,
      options: { encrypt: env.DB_ENCRYPT === 'true', trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE === 'true' },
    }).connect();
    await ensure(pool); pool.request = () => new Request(pool);
    const users = (await pool.request().query('SELECT UserID,TenDangNhap,SoDienThoai FROM NguoiDung WHERE UserID IN(1,2) ORDER BY UserID')).recordset;
    assert.equal(users.length, 2); assert.ok(users.every(row => row.TenDangNhap.startsWith('fixture.')));
    assert.equal((await pool.request().query('SELECT UserID FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID=1')).recordset[0].UserID, 2);
    const counts = async () => (await pool.request().query(`SELECT
      (SELECT COUNT(*) FROM NguoiDung) AS users,(SELECT COUNT(*) FROM HoSoNguoiCaoTuoi) AS profiles,
      (SELECT COUNT(*) FROM ChiSoSucKhoe) AS metrics,(SELECT COUNT(*) FROM CanhBao) AS alerts,
      (SELECT COUNT(*) FROM LichKhamBenh) AS appointments,(SELECT COUNT(*) FROM ThongBao) AS notifications`)).recordset[0];
    const before = await counts();
    const scope = { targetElderlyId: (_, id) => Number(id), isMobileRole: () => false, scopedWhere: () => '' };
    const clock = (await pool.request().query(`SELECT CONVERT(CHAR(10),DATEADD(HOUR,7,SYSUTCDATETIME()),23) AS today,
      CONVERT(CHAR(10),DATEADD(DAY,-1,DATEADD(HOUR,7,SYSUTCDATETIME())),23) AS yesterday,
      CONVERT(CHAR(10),DATEADD(DAY,1,DATEADD(HOUR,7,SYSUTCDATETIME())),23) AS tomorrow`)).recordset[0];
    await t.test('AUD-08: reject past today, allow tomorrow 08:00; actual SQL INSERT guarded', async () => {
      await inTransaction(async view => {
        const controller = load('../src/controllers/lichKhamBenh.controller.js', {
          '../config/db': { poolPromise: Promise.resolve(view), sql: { ...sql, Request } },
          '../middlewares/mobile-scope.middleware': scope, '../socket': { emitToAdmin() {}, emitToUser() {} },
        });
        const body = { nguoiCaoTuoiId: 1, ngayKham: clock.today, gioKham: '00:00', noiKham: 'PHASE2 FAKE CLINIC' };
        assert.equal((await call(controller.create, body)).statusCode, 422);
        const res = await call(controller.create, { ...body, ngayKham: clock.tomorrow, gioKham: '08:00' });
        assert.equal(res.statusCode, 201);
        const row = (await view.request().input('id', sql.Int, res.body.data.id).query("SELECT CONVERT(VARCHAR(19),ThoiGianKham,126) AS wall FROM LichKhamBenh WHERE LichKhamID=@id")).recordset[0];
        assert.equal(row.wall, `${clock.tomorrow}T08:00:00`);
      });
    });
    await t.test('AUD-11: special-care profile gets one due reminder, stopped profile gets none', async () => {
      await inTransaction(async view => {
        await view.request().query("UPDATE HoSoNguoiCaoTuoi SET TrangThai=N'CanChamSocDacBiet' WHERE NguoiCaoTuoiID=1");
        const insert = async () => (await view.request().query(`INSERT INTO LichKhamBenh(NguoiCaoTuoiID,TenBenhVien,ThoiGianKham,TrangThai,NguoiTaoID)
          OUTPUT INSERTED.LichKhamID AS id VALUES(1,N'PHASE2 FAKE CLINIC',DATEADD(HOUR,8,DATEADD(HOUR,7,SYSUTCDATETIME())),N'ChuaDen',1)`)).recordset[0].id;
        const id = await insert();
        const service = load('../src/services/appointmentReminder.service.js', {
          '../config/db': { poolPromise: Promise.resolve(view) }, '../socket': { emitToUser() {} },
        });
        assert.equal((await service.materializeDueAppointmentReminders(view)).filter(row => row.appointmentId === id).length, 1);
        assert.equal((await service.materializeDueAppointmentReminders(view)).length, 0);
        await view.request().query("UPDATE HoSoNguoiCaoTuoi SET TrangThai=N'NgungTheoDoi' WHERE NguoiCaoTuoiID=1");
        const stopped = await insert();
        assert.equal((await service.materializeDueAppointmentReminders(view)).filter(row => row.appointmentId === stopped).length, 0);
      });
    });
    await t.test('AUD-13: actual SQL distinguishes missing limits, configured limits and stored abnormal flag', async () => {
      const { metricAssessmentSql } = require('../src/utils/metricAssessment');
      const rows = (await pool.request().query(`SELECT ${metricAssessmentSql('t', 'c')} AS state
        FROM (VALUES(CAST(NULL AS decimal(10,2)),CAST(NULL AS decimal(10,2)),CAST(NULL AS decimal(10,2)),CAST(NULL AS decimal(10,2))),
          (60,100,NULL,NULL),(60,100,NULL,NULL)) t(GiaTriMin,GiaTriMax,GiaTriMin2,GiaTriMax2)
        CROSS APPLY(SELECT CASE WHEN t.GiaTriMin IS NULL THEN 0 ELSE 1 END AS x) v
        CROSS APPLY(SELECT CAST(0 AS bit) AS LaBatThuong,CAST(NULL AS decimal(10,2)) AS GiaTriPhu) c`)).recordset;
      assert.equal(rows.filter(row => row.state === 'CHUA_CO_NGUONG').length, 1);
      assert.equal(rows.filter(row => row.state === 'BINH_THUONG').length, 2);
      const abnormal = (await pool.request().query(`SELECT ${metricAssessmentSql('t','c')} AS state
        FROM (VALUES(NULL,NULL,NULL,NULL)) t(GiaTriMin,GiaTriMax,GiaTriMin2,GiaTriMax2)
        CROSS APPLY(SELECT 1 AS LaBatThuong,NULL AS GiaTriPhu) c`)).recordset[0];
      assert.equal(abnormal.state, 'BAT_THUONG');
    });
    await t.test('AUD-14: backdated abnormal measurement keeps its date; fresh alert/SLA and emitted timestamp agree', async () => {
      await inTransaction(async view => {
        const events = [];
        const controller = load('../src/controllers/chiSoSucKhoe.controller.js', {
          '../config/db': { poolPromise: Promise.resolve(view), sql: { ...sql, Request } },
          '../middlewares/mobile-scope.middleware': scope, '../socket': { emitToAdmin() {} },
          '../services/alertNotification.service': { notifyAlertRecipients: async () => ({}), emitAlertNotifications: (_, payload) => events.push(payload) },
        });
        const res = await call(controller.create, { nguoiCaoTuoiId: 1, loaiChiSo: 'NHIP_TIM', giaTri: 150,
          ngayDo: clock.yesterday, gioDo: '13:05', binhThuong: false, ghiChu: 'PHASE2 SYNTHETIC MEASUREMENT' });
        assert.equal(res.statusCode, 201); assert.equal(events.length, 1);
        const { alertTimestampSql } = require('../src/utils/alertTime');
        const row = (await view.request().input('id', sql.Int, res.body.data.id).query(`SELECT
          CONVERT(VARCHAR(19),c.ThoiGianDo,126) AS measured,${alertTimestampSql('b.NgayTao')} AS created,
          DATEDIFF(SECOND,b.NgayTao,DATEADD(HOUR,7,SYSUTCDATETIME())) AS waiting
          FROM ChiSoSucKhoe c JOIN CanhBao b ON b.NguonID=c.ChiSoID AND b.NguonBang=N'ChiSoSucKhoe' WHERE c.ChiSoID=@id`)).recordset[0];
        assert.equal(row.measured, `${clock.yesterday}T13:05:00`);
        assert.equal(events[0].thoiGianPhatHien, row.created);
        assert.notEqual(events[0].thoiGianDo, row.created); assert.ok(row.waiting >= 0 && row.waiting < 30);
      });
    });
    await t.test('AUD-15: independent SQL transactions compete for one phone, only one wins; originals restored', async () => {
      const { reserveAccountIdentifiers } = require('../src/utils/accountIdentity');
      const guardedSql = { ...sql, Request }, phone = '0000075015';
      const free = (await pool.request().input('phone', sql.VarChar(15), phone).query('SELECT UserID FROM NguoiDung WHERE SoDienThoai=@phone OR TenDangNhap=@phone')).recordset;
      assert.equal(free.length, 0);
      try {
        const change = async user => {
          await ensure(pool); const tx = new sql.Transaction(pool); await tx.begin();
          try {
            await reserveAccountIdentifiers(tx, guardedSql, { userId: user.UserID, phone });
            await new Request(tx).input('id',sql.Int,user.UserID).input('phone',sql.VarChar(15),phone)
              .query('UPDATE NguoiDung SET SoDienThoai=@phone WHERE UserID=@id');
            await ensure(tx); await tx.commit(); return 'OK';
          } catch (error) { await tx.rollback(); if (error.errorCode === 'PHONE_TAKEN') return error.errorCode; throw error; }
        };
        const results = await Promise.all(users.map(change));
        assert.deepEqual(results.slice().sort(), ['OK','PHONE_TAKEN']);
        const winner = users[results.indexOf('OK')];
        await inTransaction(async (_, tx) => {
          await reserveAccountIdentifiers(tx, guardedSql, { userId: winner.UserID, phone }); // unchanged own phone
          await assert.rejects(reserveAccountIdentifiers(tx, guardedSql, { userId: users[1-results.indexOf('OK')].UserID, phone }), { errorCode: 'PHONE_TAKEN' });
        });
      } finally {
        for (const user of users) await pool.request().input('id',sql.Int,user.UserID).input('phone',sql.VarChar(15),user.SoDienThoai)
          .query('UPDATE NguoiDung SET SoDienThoai=@phone WHERE UserID=@id');
      }
      assert.deepEqual((await pool.request().query('SELECT UserID,TenDangNhap,SoDienThoai FROM NguoiDung WHERE UserID IN(1,2) ORDER BY UserID')).recordset, users);
    });
    assert.deepEqual(await counts(), before);
    t.diagnostic(JSON.stringify({ instance, database, guards, persistentNewRows: 0, fixturePhonesRestored: true,
      externalDeliveries: 0, rollbackIdentityGapsPossible: true }));
  } finally { await pool?.close(); }
});
