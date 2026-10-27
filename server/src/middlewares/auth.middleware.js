// middlewares/auth.middleware.js - Xac thuc JWT tren moi request can bao ve
const jwt = require('jsonwebtoken');
const { poolPromise, sql } = require('../config/db');
const { fail } = require('../utils/response');
const { allowedRelativeRequest } = require('../utils/relativePolicy');

const authMiddleware = async (req, res, next) => {
  // Lay token tu header Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    return fail(res, 'Khong co token xac thuc, vui long dang nhap lai', 'NO_TOKEN', 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return fail(res, 'Token da het han, vui long dang nhap lai', 'TOKEN_EXPIRED', 401);
    }
    return fail(res, 'Token khong hop le', 'INVALID_TOKEN', 401);
  }
  if (decoded.sessionVersion !== 2 || decoded.purpose) {
    return fail(res, 'Phien dang nhap cu da het hieu luc', 'INVALID_TOKEN', 401);
  }
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('userId', sql.Int, decoded.userId)
      .query(`SELECT nd.VaiTroID, nd.TrangThai, vt.TenVaiTro
        FROM NguoiDung nd JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
        WHERE nd.UserID=@userId`);
    const user = result.recordset[0];
    if (!user || user.TrangThai !== 'HoatDong'
      || user.VaiTroID !== decoded.vaiTroId || user.TenVaiTro !== decoded.tenVaiTro
      || !['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi', 'NguoiThan'].includes(user.TenVaiTro)) {
      return fail(res, 'Phien dang nhap khong con hieu luc', 'INVALID_TOKEN', 401);
    }
    req.user = {
      userId: decoded.userId,
      vaiTroId: user.VaiTroID,
      tenVaiTro: user.TenVaiTro,
    };
    if (user.TenVaiTro === 'NguoiThan') {
      res.set('Cache-Control', 'no-store');
      if (!allowedRelativeRequest(req)) {
        return fail(res, 'Người thân chỉ được xem dữ liệu qua chức năng được cấp quyền.', 'FORBIDDEN', 403);
      }
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = authMiddleware;
