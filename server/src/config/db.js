// config/db.js - Khoi tao va quan ly Connection Pool ket noi SQL Server
const sql = require('mssql');

// Lay cau hinh tu bien moi truong
const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'QLSucKhoeNguoiCaoTuoi',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    // Ma hoa SSL (false cho moi truong local)
    encrypt: process.env.DB_ENCRYPT === 'true',
    // Bo qua kiem tra SSL certificate tren dev
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  },
  pool: {
    max: 10,      // Toi da 10 connection song song
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

// Tao pool dung chung, chi khoi tao 1 lan khi app bat dau
const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then((pool) => {
    console.log('[DB] Ket noi SQL Server thanh cong:', process.env.DB_SERVER, '/', process.env.DB_DATABASE);
    return pool;
  })
  .catch((err) => {
    console.error('[DB] Ket noi SQL Server that bai:', err.message);
    process.exit(1); // Dung app neu khong ket noi duoc DB
  });

module.exports = { sql, poolPromise };
