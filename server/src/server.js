// server.js - Diem khoi chay cua ung dung
// Load bien moi truong truoc tien, sau do moi import cac module khac
require('dotenv').config();

const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket');

// Ket noi DB ngay khi server khoi dong (poolPromise tu dong chay)
require('./config/db');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

initSocket(server);

server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`[SERVER] Server dang chay tai: http://localhost:${PORT}`);
  console.log(`[SERVER] API endpoint: http://localhost:${PORT}/api`);
  console.log(`[SERVER] Moi truong: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(50));
});

module.exports = server;
