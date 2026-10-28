const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('Stage6 prescription time: real SQL with rollback-only fixture transactions', {
  skip: process.env.CARESENIOR_PRESCRIPTION_STAGE6 !== '1', timeout: 60000,
}, async t => {
  const sql = require('mssql');
  const env = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
  const database = 'CareSeniorRelativesTest_Stage6_20261027';
  const instance = 'DESKTOP-4FJVTFU\\SQLEXPRESS';
  const RawRequest = sql.Request, snapshots = [], events = [];
  const marker = `PRESCRIPTION_TIME_TEST_${Date.now()}`;
  let pool, guardCount = 0;
  const ensure = async connection => {
    const row = (await new RawRequest(connection).query('SELECT @@SERVERNAME AS instance,DB_NAME() AS db')).recordset[0];
    assert.equal(row.instance, instance); assert.equal(row.db, database); guardCount++;
  };
  class GuardRequest extends RawRequest {
    constructor(parent) { super(parent); this.target = parent; }
    async query(statement) {
      await ensure(this.target);
      assert.doesNotMatch(statement, /\b(?:USE\s|CREATE\s+DATABASE|DROP\s|TRUNCATE\s|ALTER\s)/i);
      return super.query(statement);
    }
  }
  class RollbackFixtureTransaction extends sql.Transaction {
    async begin(level) { await ensure(this.parent); return super.begin(level); }
    async commit() {
      await ensure(this);
      const rows = (await new RawRequest(this).input('marker', sql.NVarChar(500), marker).query(`
        SELECT CONVERT(VARCHAR(19),l.ThoiGianDuKien,126) AS wall,
          CASE WHEN l.ThoiGianDuKien>DATEADD(HOUR,7,SYSUTCDATETIME()) THEN 1 ELSE 0 END AS future
        FROM LichUongThuoc l JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID=l.DonThuocChiTietID
        JOIN DonThuoc d ON d.DonThuocID=ct.DonThuocID
        WHERE d.GhiChu=@marker ORDER BY l.ThoiGianDuKien`)).recordset;
      assert.ok(rows.length > 0); assert.ok(rows.every(row => row.future === 1));
      snapshots.push(rows);
      // Intentionally roll back the synthetic request at the commit boundary.
      // SQL generation/constraints/validation execute for real; no test rows persist.
      return super.rollback();
    }
  }
  try {
    pool = await new sql.ConnectionPool({
      server: env.DB_SERVER || 'localhost', port: Number(env.DB_PORT) || 1433,
      user: env.DB_USER, password: env.DB_PASSWORD, database,
      connectionTimeout: 10000, requestTimeout: 15000,
      options: { encrypt: env.DB_ENCRYPT === 'true', trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE === 'true' },
    }).connect();
    await ensure(pool); pool.request = () => new GuardRequest(pool);
    const users = (await pool.request().query("SELECT CASE WHEN TenDangNhap LIKE 'fixture.%' THEN 1 ELSE 0 END AS fixture FROM NguoiDung WHERE UserID IN(1,2)")).recordset;
    assert.equal(users.length, 2); assert.ok(users.every(row => row.fixture === 1));
    assert.equal((await pool.request().query('SELECT UserID FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID=1')).recordset[0].UserID, 2);
    const drug = (await pool.request().query('SELECT TOP(1) ThuocID AS id FROM DanhMucThuoc WHERE TrangThai=1 ORDER BY ThuocID')).recordset[0];
    assert.ok(drug);
    const counts = async () => (await pool.request().query(`SELECT
      (SELECT COUNT(*) FROM DonThuoc) AS prescriptions,
      (SELECT COUNT(*) FROM DonThuocChiTiet) AS details,
      (SELECT COUNT(*) FROM LichUongThuoc) AS doses`)).recordset[0];
    const before = await counts();
    const today = (await pool.request().query('SELECT CONVERT(CHAR(10),DATEADD(HOUR,7,SYSUTCDATETIME()),23) AS day')).recordset[0].day;
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const filename = path.resolve(__dirname, '../src/controllers/donThuoc.controller.js');
    const module = { exports: {} }, local = createRequire(filename);
    vm.runInThisContext(`(function(require,module,exports){${fs.readFileSync(filename, 'utf8')}\n})`, { filename })(name => ({
      '../config/db': { poolPromise: Promise.resolve(pool), sql: { ...sql, Request: GuardRequest, Transaction: RollbackFixtureTransaction } },
      '../socket': { emitToAdmin: (...args) => events.push(args), emitToUser: (...args) => events.push(args) },
    }[name] || local(name)), module, module.exports);
    const call = async (start, end, times) => {
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
      await module.exports.create({ params: { id: '1' }, user: { userId: 1 }, body: {
        ngayBatDau: start, ngayKetThuc: end, ghiChu: marker,
        danhSachThuoc: [{ thuocId: drug.id, lieuDung: 'LIỀU GIẢ KIỂM THỬ', soLanMoiNgay: times.length, gioUong: times }],
      } }, response, error => { throw error; });
      return response;
    };
    await t.test('past-only today returns 422; no partial prescription or realtime', async () => {
      const res = await call(today, today, ['00:00']);
      assert.equal(res.statusCode, 422); assert.equal(res.body.errorCode, 'NO_FUTURE_DOSES');
      assert.equal(events.length, 0); assert.deepEqual(await counts(), before);
    });
    await t.test('tomorrow early hour generates one real future dose with matching response count', async () => {
      const res = await call(tomorrow, tomorrow, ['08:00']);
      assert.equal(res.statusCode, 201); assert.equal(res.body.data.soLichDaTao, 1);
      assert.equal(snapshots.at(-1)[0].wall, `${tomorrow}T08:00:00`);
      assert.deepEqual(await counts(), before);
    });
    await t.test('past occurrence today is skipped but recurrence tomorrow remains', async () => {
      const res = await call(today, tomorrow, ['00:00']);
      assert.equal(res.statusCode, 201); assert.equal(res.body.data.soLichDaTao, 1);
      assert.equal(snapshots.at(-1)[0].wall, `${tomorrow}T00:00:00`);
    });
    await t.test('multiple daily occurrences preserve both times without past rows', async () => {
      const res = await call(tomorrow, tomorrow, ['20:00', '08:00']);
      assert.equal(res.statusCode, 201); assert.equal(res.body.data.soLichDaTao, 2);
      assert.deepEqual(snapshots.at(-1).map(row => row.wall), [`${tomorrow}T08:00:00`, `${tomorrow}T20:00:00`]);
    });
    assert.deepEqual(await counts(), before);
    t.diagnostic(JSON.stringify({ instance, database, guardCount, persistedTestRows: 0,
      transactions: 'rollback-only; identity gaps may be allocated', externalDeliveries: 0 }));
  } finally { await pool?.close(); }
});
