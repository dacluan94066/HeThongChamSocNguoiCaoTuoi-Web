const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const ADMIN_ROOM = 'admin_bacsi';
let io = null;

const parseAllowedOrigins = () => (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const initSocket = (server) => {
  if (io) return io;

  io = new Server(server, {
    cors: {
      origin: parseAllowedOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const authToken = socket.handshake.auth?.token;
    const bearerToken = socket.handshake.headers?.authorization;
    const token = authToken
      || (bearerToken?.startsWith('Bearer ') ? bearerToken.slice(7) : null);

    if (!token) {
      return next(new Error('NO_TOKEN'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = {
        userId: decoded.userId,
        vaiTroId: decoded.vaiTroId,
        tenVaiTro: decoded.tenVaiTro,
      };
      return next();
    } catch (_) {
      return next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, tenVaiTro } = socket.user;
    socket.join(`user:${userId}`);
    socket.join(`role:${tenVaiTro}`);

    if (['QuanTriVien', 'BacSi'].includes(tenVaiTro)) {
      socket.join(ADMIN_ROOM);
    }
  });

  return io;
};

const getIO = () => io;

const emitToAdmin = (eventName, data) => {
  if (!io) return false;
  io.to(ADMIN_ROOM).emit(eventName, data);
  return true;
};

module.exports = {
  initSocket,
  getIO,
  emitToAdmin,
  ADMIN_ROOM,
  get io() {
    return io;
  },
};
