const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { scopedWhere, targetElderlyId, isMobileRole, ownsElderlyId } = require('../middlewares/mobile-scope.middleware');
const { versionSql, endpoint, createNote, history } = require('../services/careNoteMutation.service');
const { NOTE_TYPE_LABELS, validateCareNoteFilters } = require('../utils/careNoteValidation');
const { attachNoteHistory } = require('../utils/careNoteAudit');

const mapNote = (row, req) => ({
  id: row.id, nguoiCaoTuoiId: row.nguoiCaoTuoiId, nguoiCaoTuoiTen: row.nguoiCaoTuoiTen,
  nguoiChamSocId: row.nguoiChamSocId, nguoiChamSocTen: row.nguoiChamSocTen,
  authorUserId: row.authorUserId,
  loaiNhatKy: row.loaiNhatKy,
  loaiNhatKyLabel: NOTE_TYPE_LABELS[row.loaiNhatKy] || 'Chăm sóc hàng ngày',
  tieuDe: row.hoatDong, noiDung: row.moTaChiTiet,
  ngay: row.ngayGhi?.slice(0, 10) || '', thoiGian: row.ngayGhi?.slice(11, 16) || '',
  thoiGianChamSoc: row.ngayGhi || null, ngayTao: row.ngayTao || null,
  // Recording an incident is not equivalent to resolving it.
  trangThai: row.trangThai === 'DANG_THUC_HIEN' ? 'DangThucHien' : 'HoanThanh',
  trangThaiLabel: row.trangThai === 'DANG_THUC_HIEN' ? 'Đang thực hiện' : 'Đã ghi nhận',
  version: row.version,
  canEdit: ['QuanTriVien', 'NguoiChamSoc'].includes(req.user.tenVaiTro),
});

const getAll = async (req, res, next) => {
  try {
    const parsed = validateCareNoteFilters(req.query);
    if (parsed.error) return fail(res, parsed.error.message, parsed.error.code, 422);
    const { elderlyId, from, to, type, search } = parsed.value;
    if (isMobileRole(req) && elderlyId != null && targetElderlyId(req, elderlyId) == null) {
      return fail(res, 'Không có quyền đọc nhật ký của hồ sơ này.', 'FORBIDDEN_ELDERLY', 403);
    }
    const pool = await poolPromise;
    const request = pool.request();
    let statement = [
      'SELECT n.NhatKyID AS id,n.NguoiCaoTuoiID AS nguoiCaoTuoiId,nct.HoTen AS nguoiCaoTuoiTen,',
      'n.NguoiChamSocID AS nguoiChamSocId,COALESCE(nd.HoTen,ncs.HoTen) AS nguoiChamSocTen,',
      'ncs.UserID AS authorUserId,CONVERT(VARCHAR(19),n.NgayGhi,126) AS ngayGhi,',
      'CONVERT(VARCHAR(19),n.NgayTao,126) AS ngayTao,n.TrangThai AS trangThai,',
      'n.HoatDong AS hoatDong,n.MoTaChiTiet AS moTaChiTiet,n.LoaiNhatKy AS loaiNhatKy,',
      versionSql('n') + ' AS version FROM NhatKyChamSoc n',
      'JOIN HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID=n.NguoiCaoTuoiID',
      'LEFT JOIN NguoiChamSoc ncs ON ncs.NguoiChamSocID=n.NguoiChamSocID',
      'LEFT JOIN NguoiDung nd ON nd.UserID=ncs.UserID WHERE n.TrangThai<>N\'HUY\'',
    ].join(' ');
    if (elderlyId != null) { request.input('elderlyId', sql.Int, elderlyId); statement += ' AND n.NguoiCaoTuoiID=@elderlyId'; }
    if (from) { request.input('from', sql.VarChar(10), from); statement += ' AND n.NgayGhi>=CONVERT(DATE,@from,23)'; }
    // All DATETIME2 values already fall within the maximum SQL calendar date.
    if (to && to !== '9999-12-31') { request.input('to', sql.VarChar(10), to); statement += ' AND n.NgayGhi<DATEADD(DAY,1,CONVERT(DATE,@to,23))'; }
    if (type) { request.input('type', sql.NVarChar(30), type); statement += ' AND n.LoaiNhatKy=@type'; }
    if (search) {
      request.input('search', sql.NVarChar(100), search);
      statement += ' AND (CHARINDEX(@search,n.HoatDong)>0 OR CHARINDEX(@search,n.MoTaChiTiet)>0)';
    }
    statement += scopedWhere(req, 'n.NguoiCaoTuoiID');
    statement += ' ORDER BY n.NgayGhi DESC,n.NhatKyID DESC';
    const result = await request.query(statement);
    return ok(res, await attachNoteHistory(pool, result.recordset.map((row) => mapNote(row, req))));
  } catch (error) { return next(error); }
};

const create = async (req, res, next) => {
  try {
    const elderlyId = targetElderlyId(req, req.body?.nguoiCaoTuoiId);
    if (isMobileRole(req) && elderlyId == null) return fail(res, 'Không có quyền ghi nhật ký cho hồ sơ này.', 'FORBIDDEN_ELDERLY', 403);
    const result = await createNote({ user: req.user, elderlyId, body: req.body });
    return ok(res, result, 'Đã thêm nhật ký chăm sóc.', 201);
  } catch (error) {
    if (error.status) return fail(res, error.message, error.code, error.status);
    return next(error);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647) return fail(res, 'ID nhật ký không hợp lệ.', 'INVALID_ID', 400);
    const pool = await poolPromise;
    const result = await pool.request().input('id', sql.Int, id).query(
      'SELECT NguoiCaoTuoiID AS elderlyId FROM NhatKyChamSoc WHERE NhatKyID=@id');
    if (!result.recordset.length) return fail(res, 'Không tìm thấy nhật ký.', 'NOTE_NOT_FOUND', 404);
    if (!ownsElderlyId(req, result.recordset[0].elderlyId)) return fail(res, 'Không có quyền xem lịch sử hồ sơ này.', 'FORBIDDEN_ELDERLY', 403);
    return ok(res, await history(pool, id));
  } catch (error) {
    if (error.status) return fail(res, error.message, error.code, error.status);
    return next(error);
  }
};

module.exports = { getAll, create, getHistory, update: endpoint(false), remove: endpoint(true) };
