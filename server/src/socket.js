const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { poolPromise, sql } = require('./config/db');
const { isAllowedOrigin } = require('./middlewares/cors.middleware');

const ADMIN_ROOM = 'admin';
let io = null;

const initSocket = (server) => {
  if (io) return io;

  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error('CORS_ORIGIN_DENIED'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const authToken = socket.handshake.auth?.token;
    const bearerToken = socket.handshake.headers?.authorization;
    const token = authToken
      || (bearerToken?.startsWith('Bearer ') ? bearerToken.slice(7) : null);

    if (!token) return next(new Error('NO_TOKEN'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.sessionVersion !== 2 || decoded.purpose) return next(new Error('INVALID_TOKEN'));
      const pool = await poolPromise;
      const result = await pool.request().input('userId', sql.Int, decoded.userId)
        .query(`SELECT nd.VaiTroID, nd.TrangThai, vt.TenVaiTro
          FROM NguoiDung nd JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
          WHERE nd.UserID=@userId`);
      const user = result.recordset[0];
      if (!user || user.TrangThai !== 'HoatDong'
        || user.VaiTroID !== decoded.vaiTroId || user.TenVaiTro !== decoded.tenVaiTro
        || !['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi', 'NguoiThan'].includes(user.TenVaiTro)) {
        return next(new Error('INVALID_TOKEN'));
      }
      socket.user = {
        userId: decoded.userId,
        vaiTroId: user.VaiTroID,
        tenVaiTro: user.TenVaiTro,
      };
      return next();
    } catch (_) {
      return next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, tenVaiTro } = socket.user;
    socket.join(`user:${userId}`);
    socket.join(`user_${userId}`);
    socket.join(`role:${tenVaiTro}`);

    if (tenVaiTro === 'QuanTriVien') {
      socket.join(ADMIN_ROOM);
    }
  });

  return io;
};

const emitToAdmin = (eventName, data) => {
  if (!io) return false;
  io.to(ADMIN_ROOM).emit(eventName, data);
  const elderlyId = Number(data?.nguoiCaoTuoiId || data?.elderlyId);
  if (Number.isInteger(elderlyId) && elderlyId > 0) {
    emitToAssignedCaregivers(elderlyId, eventName, data).catch((error) => {
      console.error('[SOCKET] Khong gui duoc cho nguoi cham soc:', error.message);
    });
  }
  return true;
};

const emitToAssignedCaregivers = async (elderlyId, eventName, data) => {
  const pool = await poolPromise;
  const result = await pool.request().input('elderlyId', sql.Int, elderlyId).query(`
    SELECT DISTINCT ncs.UserID AS userId
    FROM NguoiCaoTuoi_NguoiChamSoc lk
    JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID=lk.NguoiChamSocID
    JOIN NguoiDung nd ON nd.UserID=ncs.UserID
    JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
    WHERE lk.NguoiCaoTuoiID=@elderlyId AND vt.TenVaiTro=N'NguoiChamSoc'
      AND nd.TrangThai=N'HoatDong' AND ncs.TrangThai=N'DangLamViec'
      AND lk.NgayBatDau<=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
      AND (lk.NgayKetThuc IS NULL OR lk.NgayKetThuc>CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE))
  `);
  for (const row of result.recordset) emitToUser(row.userId, eventName, data);
};

const emitToUser = (userId, eventName, data) => {
  if (!io || !Number.isInteger(Number(userId)) || Number(userId) < 1) {
    return false;
  }
  io.to(`user_${Number(userId)}`).emit(eventName, data);
  return true;
};

const emitToAdminOnly = (eventName, data) => {
  if (!io) return false;
  io.to(ADMIN_ROOM).emit(eventName, data);
  return true;
};

module.exports = { initSocket, emitToAdmin, emitToAdminOnly, emitToUser, ADMIN_ROOM };
