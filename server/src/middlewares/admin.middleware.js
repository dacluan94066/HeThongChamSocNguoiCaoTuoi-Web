const { fail } = require('../utils/response');

module.exports = (req, res, next) => {
  if (req.user?.tenVaiTro !== 'QuanTriVien') {
    return fail(res, 'Chi QuanTriVien duoc quan tri lien ket tai khoan', 'ADMIN_REQUIRED', 403);
  }
  next();
};
