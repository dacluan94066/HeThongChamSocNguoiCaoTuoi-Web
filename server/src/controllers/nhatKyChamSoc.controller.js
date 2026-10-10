// controllers/nhatKyChamSoc.controller.js - Nhat ky cham soc - dung schema that
// Bang NhatKyChamSoc: NhatKyID, NguoiCaoTuoiID, NguoiChamSocID,
//   NgayGhi (DATETIME2), HoatDong, MoTaChiTiet, HinhAnh
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { scopedWhere, targetElderlyId, isMobileRole } = require('../middlewares/mobile-scope.middleware');
const {versionSql,endpoint}=require('../services/careNoteMutation.service');

const mapNote = (row,req) => ({
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
  ngay:             row.ngayGhi ? row.ngayGhi.slice(0, 10) : '',
  thoiGian:         row.ngayGhi ? row.ngayGhi.slice(11, 16) : '',
  trangThai:        'HoanThanh',
  trangThaiLabel:   'Hoàn thành',
  version: row.version,
  canEdit: req.user.tenVaiTro==='QuanTriVien'||(req.user.tenVaiTro==='NguoiChamSoc'&&row.authorUserId===req.user.userId),
});

// GET /api/care-notes?nguoiCaoTuoiId=&ngay=
const getAll = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, ngay } = req.query;
    if (nguoiCaoTuoiId != null && (!/^\d+$/.test(String(nguoiCaoTuoiId)) ||
        Number(nguoiCaoTuoiId) < 1 || Number(nguoiCaoTuoiId) > 2147483647))
      return fail(res, 'Ho so khong hop le', 'INVALID_PROFILE', 400);
    if (isMobileRole(req) && nguoiCaoTuoiId != null && targetElderlyId(req, Number(nguoiCaoTuoiId)) == null)
      return fail(res, 'Khong co quyen doc nhat ky cho ho so nay', 'FORBIDDEN_ELDERLY', 403);
    const pool = await poolPromise;

    let query = `
      SELECT n.NhatKyID AS id, n.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen, n.NguoiChamSocID AS nguoiChamSocId,
        nd.HoTen AS nguoiChamSocTen, CONVERT(VARCHAR(19),n.NgayGhi,126) AS ngayGhi,
        n.HoatDong AS hoatDong, n.MoTaChiTiet AS moTaChiTiet, ncs.UserID AS authorUserId,
        ${versionSql('n')} AS version
      FROM NhatKyChamSoc n
      JOIN HoSoNguoiCaoTuoi nct ON n.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
      LEFT JOIN NguoiChamSoc ncs ON n.NguoiChamSocID = ncs.NguoiChamSocID
      LEFT JOIN NguoiDung nd ON ncs.UserID = nd.UserID
      WHERE n.TrangThai<>N'HUY'
    `;
    const req2 = pool.request();
    if (nguoiCaoTuoiId) { query += ` AND n.NguoiCaoTuoiID=@nctId`; req2.input('nctId', sql.Int, parseInt(nguoiCaoTuoiId)); }
    if (ngay) { query += ` AND CAST(n.NgayGhi AS DATE)=@ngay`; req2.input('ngay', sql.Date, ngay); }
    query += scopedWhere(req, 'n.NguoiCaoTuoiID');
    query += ` ORDER BY n.NgayGhi DESC,n.NhatKyID DESC`;

    const result = await req2.query(query);
    return ok(res, result.recordset.map(row=>mapNote(row,req)));
  } catch (err) { next(err); }
};

// POST /api/care-notes
// Frontend gui: nguoiCaoTuoiId, tieuDe (->HoatDong), noiDung (->MoTaChiTiet)
const create = async (req, res, next) => {
  let transaction;
  try {
    const { tieuDe, noiDung } = req.body;
    const nguoiCaoTuoiId = targetElderlyId(req, req.body.nguoiCaoTuoiId);
    if (isMobileRole(req) && nguoiCaoTuoiId == null) return fail(res, 'Khong co quyen ghi nhat ky cho ho so nay', 'FORBIDDEN_ELDERLY', 403);
    if (!nguoiCaoTuoiId || !tieuDe || !noiDung)
      return fail(res, 'nguoiCaoTuoiId, tieuDe, noiDung la bat buoc', 'MISSING_FIELDS', 400);
    if (typeof tieuDe !== 'string' || !tieuDe.trim() || tieuDe.trim().length > 200 ||
        typeof noiDung !== 'string' || !noiDung.trim() || noiDung.trim().length > 1000)
      return fail(res, 'Tieu de toi da 200 va noi dung toi da 1000 ky tu', 'INVALID_NOTE', 400);

    const pool = await poolPromise;
    transaction=new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await require('../services/alertWorkflow.service').authorizeWrite(transaction,req.user,nguoiCaoTuoiId,'QLNHATKY');

    // Tim NguoiChamSocID tu UserID dang nhap
    const ncsRes = await new sql.Request(transaction).input('uid', sql.Int, req.user.userId)
      .query(`SELECT NguoiChamSocID FROM NguoiChamSoc WHERE UserID=@uid`);
    const nguoiChamSocId = ncsRes.recordset[0]?.NguoiChamSocID || null;
    if (isMobileRole(req) && !nguoiChamSocId)
      throw require('../services/alertWorkflow.service').problem(403,'PROFILE_REQUIRED','Tài khoản chưa liên kết người chăm sóc.');

    const r = await new sql.Request(transaction)
      .input('nctId', sql.Int, nguoiCaoTuoiId)
      .input('nguoiChamSocId', sql.Int, nguoiChamSocId)
      .input('hoatDong', sql.NVarChar(200), tieuDe.trim())
      .input('moTa', sql.NVarChar(1000), noiDung.trim())
      .query(`INSERT INTO NhatKyChamSoc (NguoiCaoTuoiID,NguoiChamSocID,NgayGhi,HoatDong,MoTaChiTiet)
              OUTPUT INSERTED.NhatKyID AS id
              VALUES (@nctId,@nguoiChamSocId,DATEADD(HOUR,7,SYSUTCDATETIME()),@hoatDong,@moTa)`);
    await transaction.commit();transaction=null;
    return ok(res, { id: r.recordset[0].id }, 'Them nhat ky thanh cong', 201);
  } catch (err) {
    if(transaction){try{await transaction.rollback();}catch(_){}}
    if(err.status)return fail(res,err.message,err.code,err.status);
    next(err);
  }
};

module.exports = { getAll, create, update:endpoint(false), remove:endpoint(true) };
