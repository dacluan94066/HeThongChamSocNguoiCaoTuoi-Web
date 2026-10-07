// middlewares/permission.middleware.js - Kiem tra quyen truy cap theo vai tro
const { poolPromise, sql } = require('../config/db');
const { fail } = require('../utils/response');

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

      // mssql tra BIT thanh boolean; chi true hoac so 1 moi cap quyen.
      const quyen = result.recordset[0]?.[cotQuyen];
      if (quyen !== true && quyen !== 1) {
        return fail(res, 'Ban khong co quyen thuc hien thao tac nay', 'FORBIDDEN', 403);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { checkPermission };
