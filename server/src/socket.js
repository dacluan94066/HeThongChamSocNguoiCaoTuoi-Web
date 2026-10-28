const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { setTimeout, clearTimeout } = require('node:timers');
const { poolPromise, sql } = require('./config/db');
const { isAllowedOrigin } = require('./middlewares/cors.middleware');

const ADMIN_ROOM = 'admin';
let io = null;

// A room is a delivery address, never proof that a session is still valid.
const activeAccount = async (identity) => {
  const pool = await poolPromise;
  const result = await pool.request().input('userId', sql.Int, identity.userId)
    .query(`SELECT nd.VaiTroID, nd.TrangThai, vt.TenVaiTro
      FROM NguoiDung nd JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
      WHERE nd.UserID=@userId`);
  const user = result.recordset[0];
  return user?.TrangThai === 'HoatDong' && user.VaiTroID === identity.vaiTroId
    && user.TenVaiTro === identity.tenVaiTro
    && ['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi', 'NguoiThan'].includes(user.TenVaiTro);
};
const expired = socket => socket.data.expiresAt != null && Date.now() >= socket.data.expiresAt;

const emitAuthorized = (room, eventName, data) => {
  // Preserve the value at enqueue time and the per-connection event order.
  const payload = data === undefined ? undefined : JSON.parse(JSON.stringify(data));
  for (const socket of io.sockets.sockets.values()) {
    if (!socket.rooms.has(room)) continue;
    socket.data.delivery = (socket.data.delivery || Promise.resolve()).then(async () => {
      if (!socket.connected) return;
      if (expired(socket) || !await activeAccount(socket.user) || expired(socket)) {
        socket.disconnect(true);
        return;
      }
      if (socket.connected) socket.emit(eventName, payload);
    }).catch(() => {
      // Fail closed on a DB/read failure. A later event can recheck again.
      console.error('[SOCKET] Khong xac minh duoc phien nhan; khong phat su kien.');
    });
  }
};

const disconnectUser = userId => {
  if (!io) return 0;
  let count = 0;
  for (const socket of io.sockets.sockets.values()) {
    if (socket.user?.userId !== Number(userId)) continue;
    socket.disconnect(true);
    count++;
  }
  return count;
};

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
      socket.user = {
        userId: decoded.userId,
        vaiTroId: decoded.vaiTroId,
        tenVaiTro: decoded.tenVaiTro,
      };
      socket.data.expiresAt = decoded.exp == null ? null : decoded.exp * 1000;
      if (!await activeAccount(socket.user) || expired(socket)) return next(new Error('INVALID_TOKEN'));
      return next();
    } catch (_) {
      return next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    let expiryTimer;
    const expireSession = () => {
      if (socket.data.expiresAt == null) return;
      const remaining = socket.data.expiresAt - Date.now();
      if (remaining <= 0) { socket.disconnect(true); return; }
      expiryTimer = setTimeout(expireSession, Math.min(remaining, 2147483647));
      expiryTimer.unref?.();
    };
    socket.once('disconnect', () => clearTimeout(expiryTimer));
    expireSession();
    if (!socket.connected) return;
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
  emitAuthorized(ADMIN_ROOM, eventName, data);
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
  emitAuthorized(`user_${Number(userId)}`, eventName, data);
  return true;
};

const emitToAdminOnly = (eventName, data) => {
  if (!io) return false;
  emitAuthorized(ADMIN_ROOM, eventName, data);
  return true;
};

module.exports = { initSocket, emitToAdmin, emitToAdminOnly, emitToUser, disconnectUser, ADMIN_ROOM };
