const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { createRequire } = require('node:module');
const jwt = require('jsonwebtoken');
const { io: client } = require('socket.io-client');

test('Stage6 SQL + real Socket.IO: lock rollback and JWT expiry block private delivery', {
  skip: process.env.CARESENIOR_SOCKET_STAGE6 !== '1', timeout: 30000,
}, async t => {
  require('./stage6-test-safety.cjs').forbidLiveDbImport(t);
  const sql = require('mssql'), Raw = sql.Request;
  const env = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
  const database = 'CareSeniorRelativesTest_Stage6_20261027', instance = 'DESKTOP-4FJVTFU\\SQLEXPRESS';
  const secret = 'stage6-isolated-socket-test-only';
  let pool, transaction, target, server, io, guardCount = 0;
  const clients = [], seen = [];
  const ensure = async connection => {
    const row = (await new Raw(connection).query('SELECT @@SERVERNAME AS instance,DB_NAME() AS db')).recordset[0];
    assert.equal(row.instance, instance); assert.equal(row.db, database); guardCount++;
  };
  class Request extends Raw {
    constructor(connection) { super(connection); this.target = connection; }
    async query(statement) {
      await ensure(this.target);
      assert.doesNotMatch(statement, /\b(?:USE\s|CREATE\s+DATABASE|DROP\s|TRUNCATE\s|ALTER\s)/i);
      return super.query(statement);
    }
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    pool = await new sql.ConnectionPool({ server: env.DB_SERVER || 'localhost', port: Number(env.DB_PORT) || 1433,
      user: env.DB_USER, password: env.DB_PASSWORD, database, requestTimeout: 10000,
      options: { encrypt: env.DB_ENCRYPT === 'true', trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE === 'true' },
    }).connect();
    await ensure(pool); target = pool;
    const before = (await new Request(pool).query('SELECT UserID,TenDangNhap,VaiTroID,TrangThai FROM NguoiDung ORDER BY UserID')).recordset;
    const account = (await new Request(pool).query(`SELECT nd.UserID AS id,nd.VaiTroID AS roleId,vt.TenVaiTro AS role
      FROM NguoiDung nd JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
      WHERE nd.UserID=1 AND nd.TenDangNhap LIKE 'fixture.%' AND nd.TrangThai=N'HoatDong' AND vt.TenVaiTro=N'QuanTriVien'`)).recordset[0];
    assert.ok(account, 'Only the existing synthetic Stage6 Admin is eligible');
    const db = { sql, poolPromise: Promise.resolve({ request: () => new Request(target) }) };
    const filename = path.resolve(__dirname, '../src/socket.js'), module = { exports: {} }, local = createRequire(filename);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
      process: { env: { JWT_SECRET: secret } }, console,
      require: name => name === './config/db' ? db : local(name),
    }, { filename });
    server = http.createServer(); io = module.exports.initSocket(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const connect = async expiresIn => {
      const token = jwt.sign({ userId: account.id, vaiTroId: account.roleId, tenVaiTro: account.role, sessionVersion: 2 }, secret, { expiresIn });
      const c = client(`http://127.0.0.1:${server.address().port}`, { auth: { token }, transports: ['websocket'], reconnection: false });
      clients.push(c); c.on('chisuckhoe:new', data => seen.push(data));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('SOCKET_CONNECT_TIMEOUT')), 2000);
        c.once('connect', () => { clearTimeout(timer); resolve(); });
        c.once('connect_error', error => { clearTimeout(timer); reject(error); });
      });
      return { c, expiresAt: jwt.decode(token).exp * 1000 };
    };
    await t.test('real SQL account lock in rollback-only transaction blocks an open Admin socket', async () => {
      const { c } = await connect('5m');
      module.exports.emitToAdminOnly('chisuckhoe:new', { id: 'fixture-before-lock' });
      await pause(150); assert.equal(seen.length, 1);
      await ensure(pool); transaction = new sql.Transaction(pool); await transaction.begin(); target = transaction;
      const lock = await new Request(transaction).input('id', sql.Int, account.id).query(`UPDATE NguoiDung SET TrangThai=N'KhoaTaiKhoan'
        WHERE UserID=@id AND TenDangNhap LIKE 'fixture.%'; SELECT @@ROWCOUNT AS changed`);
      assert.equal(lock.recordset[0].changed, 1);
      module.exports.emitToAdmin('chisuckhoe:new', { id: 'must-never-deliver' });
      await pause(150); assert.equal(seen.length, 1); assert.equal(c.connected, false);
      await ensure(transaction); await transaction.rollback(); transaction = null; target = pool;
    });
    await t.test('actual SQL-authenticated connection closes on expiry without a new event', async () => {
      const { c, expiresAt } = await connect('2s');
      await pause(Math.max(0, expiresAt - Date.now()) + 80); assert.equal(c.connected, false);
      module.exports.emitToAdminOnly('chisuckhoe:new', { id: 'expired' }); await pause(70); assert.equal(seen.length, 1);
    });
    assert.deepEqual((await new Request(pool).query('SELECT UserID,TenDangNhap,VaiTroID,TrangThai FROM NguoiDung ORDER BY UserID')).recordset, before);
    t.diagnostic(JSON.stringify({ database, instance, guardCount, accountChanges: 'rolled back', externalDeliveries: 0 }));
  } finally {
    clients.forEach(c => c.close()); if (io) await new Promise(resolve => io.close(resolve));
    if (transaction) { await ensure(transaction); await transaction.rollback(); }
    if (pool) await pool.close();
  }
});
