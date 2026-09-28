// controllers/nhatKyChamSoc.controller.js - Nhat ky cham soc - dung schema that
// Bang NhatKyChamSoc: NhatKyID, NguoiCaoTuoiID, NguoiChamSocID,
//   NgayGhi (DATETIME2), HoatDong, MoTaChiTiet, HinhAnh
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

const mapNote = (row) => ({
  id:               row.id,
  nguoiCaoTuoiId:   row.nguoiCaoTuoiId,
  nguoiCaoTuoiTen:  row.nguoiCaoTuoiTen,
  nguoiChamSocId:   row.nguoiChamSocId,
  nguoiChamSocTen:  row.nguoiChamSocTen,
  // Map HoatDong -> tieuDe, MoTaChiTiet -> noiDung cho frontend
  loaiNhatKy:       'CHAM_SOC_HANG_NGAY',
  loaiNhatKyLabel:  'Chăm sóc hàng ngày',
  tieuDe:           row.hoatDong,
  noiDung:          row.moTaChiTiet,
  ngay:             row.ngayGhi ? new Date(row.ngayGhi).toISOString().slice(0, 10) : '',
  thoiGian:         row.ngayGhi ? new Date(row.ngayGhi).toTimeString().slice(0, 5) : '',
  trangThai:        'HoanThanh',
  trangThaiLabel:   'Hoàn thành',
});

// GET /api/care-notes?nguoiCaoTuoiId=&ngay=
const getAll = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, ngay } = req.query;
    const pool = await poolPromise;

    let query = `
      SELECT n.NhatKyID AS id, n.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen, n.NguoiChamSocID AS nguoiChamSocId,
        nd.HoTen AS nguoiChamSocTen, n.NgayGhi AS ngayGhi,
        n.HoatDong AS hoatDong, n.MoTaChiTiet AS moTaChiTiet
      FROM NhatKyChamSoc n
      JOIN HoSoNguoiCaoTuoi nct ON n.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
      LEFT JOIN NguoiChamSoc ncs ON n.NguoiChamSocID = ncs.NguoiChamSocID
      LEFT JOIN NguoiDung nd ON ncs.UserID = nd.UserID
      WHERE 1=1
    `;
    const req2 = pool.request();
    if (nguoiCaoTuoiId) { query += ` AND n.NguoiCaoTuoiID=@nctId`; req2.input('nctId', sql.Int, parseInt(nguoiCaoTuoiId)); }
    if (ngay) { query += ` AND CAST(n.NgayGhi AS DATE)=@ngay`; req2.input('ngay', sql.Date, ngay); }
    query += ` ORDER BY n.NgayGhi DESC`;

    const result = await req2.query(query);
    return ok(res, result.recordset.map(mapNote));
  } catch (err) { next(err); }
};

// POST /api/care-notes
// Frontend gui: nguoiCaoTuoiId, tieuDe (->HoatDong), noiDung (->MoTaChiTiet)
const create = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, tieuDe, noiDung } = req.body;
    if (!nguoiCaoTuoiId || !tieuDe || !noiDung)
      return fail(res, 'nguoiCaoTuoiId, tieuDe, noiDung la bat buoc', 'MISSING_FIELDS', 400);

    const pool = await poolPromise;

    // Tim NguoiChamSocID tu UserID dang nhap
    const ncsRes = await pool.request().input('uid', sql.Int, req.user.userId)
      .query(`SELECT NguoiChamSocID FROM NguoiChamSoc WHERE UserID=@uid`);
    const nguoiChamSocId = ncsRes.recordset[0]?.NguoiChamSocID || null;

    const r = await pool.request()
      .input('nctId', sql.Int, nguoiCaoTuoiId)
      .input('nguoiChamSocId', sql.Int, nguoiChamSocId)
      .input('hoatDong', sql.NVarChar, tieuDe)
      .input('moTa', sql.NVarChar, noiDung)
      .query(`INSERT INTO NhatKyChamSoc (NguoiCaoTuoiID,NguoiChamSocID,NgayGhi,HoatDong,MoTaChiTiet)
              OUTPUT INSERTED.NhatKyID AS id
              VALUES (@nctId,@nguoiChamSocId,SYSDATETIME(),@hoatDong,@moTa)`);
    return ok(res, { id: r.recordset[0].id }, 'Them nhat ky thanh cong', 201);
  } catch (err) { next(err); }
};

module.exports = { getAll, create };
