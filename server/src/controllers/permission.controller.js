// controllers/permission.controller.js - Lay quyen cua tai khoan dang dang nhap
const { poolPromise, sql } = require('../config/db');
const { ok } = require('../utils/response');

// GET /api/permissions/me
const getMyPermissions = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('VaiTroID', sql.Int, req.user.vaiTroId)
      .query(`
        SELECT
          cn.MaChucNang,
          cn.TenChucNang,
          pq.ChoPhepXem,
          pq.ChoPhepThem,
          pq.ChoPhepSua,
          pq.ChoPhepXoa
        FROM PhanQuyen pq
        INNER JOIN ChucNang cn ON cn.ChucNangID = pq.ChucNangID
        WHERE pq.VaiTroID = @VaiTroID
        ORDER BY cn.ChucNangID
      `);

    const permissions = result.recordset.map((row) => ({
      maChucNang: row.MaChucNang,
      tenChucNang: row.TenChucNang,
      xem: Boolean(row.ChoPhepXem),
      them: Boolean(row.ChoPhepThem),
      sua: Boolean(row.ChoPhepSua),
      xoa: Boolean(row.ChoPhepXoa),
    }));

    return ok(res, permissions, 'Lay danh sach quyen thanh cong');
  } catch (err) {
    next(err);
  }
};

module.exports = { getMyPermissions };
