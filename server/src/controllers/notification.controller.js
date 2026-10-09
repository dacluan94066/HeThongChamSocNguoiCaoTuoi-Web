const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

const getMine = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('userId', sql.Int, req.user.userId).query(`
      SELECT ThongBaoID AS id, TieuDe AS tieuDe, NoiDung AS noiDung,
        LoaiThongBao AS loaiThongBao, LienKetBang AS lienKetBang,
        LienKetID AS lienKetId, DaDoc AS daDoc, CONVERT(VARCHAR(19),NgayTao,126) AS ngayTao
      FROM ThongBao
      WHERE UserID = @userId
      ORDER BY NgayTao DESC, ThongBaoID DESC
    `);
    return ok(res, result.recordset, 'Lay thong bao thanh cong');
  } catch (error) { next(error); }
};

const markRead = async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return fail(res, 'ID thong bao khong hop le', 'INVALID_ID', 400);
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, req.user.userId)
      .query(`
        UPDATE ThongBao SET DaDoc = 1
        OUTPUT INSERTED.ThongBaoID AS id, INSERTED.DaDoc AS daDoc
        WHERE ThongBaoID = @id AND UserID = @userId
      `);
    if (!result.recordset.length) return fail(res, 'Khong tim thay thong bao cua tai khoan nay', 'NOT_FOUND', 404);
    return ok(res, result.recordset[0], 'Da danh dau thong bao da doc');
  } catch (error) { next(error); }
};

module.exports = { getMine, markRead };
