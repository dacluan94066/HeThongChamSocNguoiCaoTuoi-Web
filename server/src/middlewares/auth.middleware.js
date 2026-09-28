// middlewares/auth.middleware.js - Xac thuc JWT tren moi request can bao ve
const jwt = require('jsonwebtoken');
const { fail } = require('../utils/response');

const authMiddleware = (req, res, next) => {
  // Lay token tu header Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    return fail(res, 'Khong co token xac thuc, vui long dang nhap lai', 'NO_TOKEN', 401);
  }

  try {
    // Xac thuc va giai ma token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Gan thong tin user vao req de cac middleware/controller phia sau dung
    req.user = {
      userId: decoded.userId,
      vaiTroId: decoded.vaiTroId,
      tenVaiTro: decoded.tenVaiTro,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return fail(res, 'Token da het han, vui long dang nhap lai', 'TOKEN_EXPIRED', 401);
    }
    return fail(res, 'Token khong hop le', 'INVALID_TOKEN', 401);
  }
};

module.exports = authMiddleware;
