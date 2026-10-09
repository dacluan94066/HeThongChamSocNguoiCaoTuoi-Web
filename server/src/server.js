// server.js - Diem khoi chay cua ung dung
// Load bien moi truong truoc tien, sau do moi import cac module khac
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });

const app = require('./app');

// Ket noi DB ngay khi server khoi dong (poolPromise tu dong chay)
require('./config/db');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`[SERVER] Server dang chay tai: http://localhost:${PORT}`);
  console.log(`[SERVER] API endpoint: http://localhost:${PORT}/api`);
  console.log(`[SERVER] Moi truong: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(50));
});
