// middlewares/permission.middleware.js - Kiem tra quyen truy cap theo vai tro
const { poolPromise, sql } = require('../config/db');
const { fail } = require('../utils/response');
const { relativePermission } = require('../utils/relativePolicy');

// Map hanh dong sang ten cot tuong ung trong bang PhanQuyen
const hanhDongMap = {
  xem: 'ChoPhepXem',
  them: 'ChoPhepThem',
  sua: 'ChoPhepSua',
  xoa: 'ChoPhepXoa',
};

/**
 * Tao middleware kiem tra quyen
 * @param {string} maChucNang - Ma chuc nang (vd: "QLHOSONCT")
 * @param {string} hanhDong - Hanh dong: "xem" | "them" | "sua" | "xoa"
 */
const checkPermission = (maChucNang, hanhDong) => {
  return async (req, res, next) => {
    try {
      // A permission-matrix mistake must never turn a family account into a writer.
      if (req.user.tenVaiTro === 'NguoiThan' && !relativePermission(maChucNang, hanhDong)) {
        return fail(res, 'Người thân không có quyền thực hiện thao tác này.', 'FORBIDDEN', 403);
      }
      // QuanTriVien duoc phep lam moi thu
      if (req.user.tenVaiTro === 'QuanTriVien') {
        return next();
      }

      const cotQuyen = hanhDongMap[hanhDong];
      if (!cotQuyen) {
        return fail(res, 'Hanh dong khong hop le', 'INVALID_ACTION', 400);
      }

      const pool = await poolPromise;

      // Kiem tra quyen trong bang PhanQuyen, join voi ChucNang de loc theo MaChucNang
      const result = await pool.request()
        .input('vaiTroId', sql.Int, req.user.vaiTroId)
        .input('maChucNang', sql.NVarChar, maChucNang)
        .query(`
          SELECT pq.${cotQuyen}
          FROM PhanQuyen pq
          INNER JOIN ChucNang cn ON pq.ChucNangID = cn.ChucNangID
          WHERE pq.VaiTroID = @vaiTroId
            AND cn.MaChucNang = @maChucNang
        `);

      // Khong co dong nao hoac quyen = 0 thi tu choi
      if (result.recordset.length === 0 || !Boolean(result.recordset[0][cotQuyen])) {
        return fail(res, 'Ban khong co quyen thuc hien thao tac nay', 'FORBIDDEN', 403);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

// Only the authenticated account is touched by the existing password controllers.
const checkOwnPasswordPermission = (req, res, next) => {
  if (req.user?.tenVaiTro !== 'NguoiThan') return checkPermission('QLHOSONCT','sua')(req,res,next);
  const allowed = req.method === 'PUT' ? ['matKhauCu','matKhauMoi'] : ['matKhauHienTai','matKhauMoi'];
  if (!req.body || Object.keys(req.body).some(key => !allowed.includes(key))
    || allowed.some(key => typeof req.body[key] !== 'string' || !req.body[key])
    || req.body.matKhauMoi.length < 6 || Buffer.byteLength(req.body.matKhauMoi,'utf8') > 72) {
    return fail(res, 'Yêu cầu đổi mật khẩu cá nhân không hợp lệ.', 'INVALID_PASSWORD', 422);
  }
  return next();
};
module.exports = { checkPermission, checkOwnPasswordPermission };
