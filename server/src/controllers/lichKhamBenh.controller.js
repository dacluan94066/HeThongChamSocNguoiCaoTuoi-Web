// Lich kham benh: API quan ly tren Web va API chi-doc cho tai khoan Mobile.
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { scopedWhere } = require('../middlewares/mobile-scope.middleware');

const STATUS = {
  ChuaDen: { ma: 'CHUA_DEN', label: 'Chưa đến' },
  DaKham: { ma: 'DA_KHAM', label: 'Đã khám' },
  Huy: { ma: 'HUY', label: 'Hủy' },
  DaDoiLich: { ma: 'DA_DOI_LICH', label: 'Đã dời lịch' },
};
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const normalizeStatus = (value) => {
  if (!value) return null;
  if (STATUS[value]) return value;
  return Object.keys(STATUS).find((key) => STATUS[key].ma === value) || null;
};

const isDateOnly = (value) => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
};

const validateAppointmentBody = (body) => {
  const {
    nguoiCaoTuoiId, ngayKham, gioKham, noiKham,
    lyDoKham, bacSiTen, ghiChu,
  } = body || {};
  if (!Number.isInteger(Number(nguoiCaoTuoiId)) || Number(nguoiCaoTuoiId) < 1) {
    return 'Người cao tuổi không hợp lệ';
  }
  if (!isDateOnly(ngayKham) || !TIME_PATTERN.test(gioKham || '')) {
    return 'Ngày khám hoặc giờ khám không hợp lệ';
  }
  if (typeof noiKham !== 'string' || !noiKham.trim()) {
    return 'Nơi khám là bắt buộc';
  }
  if (noiKham.trim().length > 200) return 'Nơi khám không được quá 200 ký tự';
  if (bacSiTen != null && String(bacSiTen).trim().length > 100) {
    return 'Tên bác sĩ không được quá 100 ký tự';
  }
  if (ghiChu != null && String(ghiChu).trim().length > 100) {
    return 'Chuyên khoa không được quá 100 ký tự';
  }
  if (lyDoKham != null && String(lyDoKham).trim().length > 300) {
    return 'Lý do khám không được quá 300 ký tự';
  }
  return null;
};

const mapWebAppointment = (row) => {
  const status = STATUS[row.trangThai] || {
    ma: row.trangThai,
    label: row.trangThai,
  };
  const dateTime = row.thoiGianKham?.toString() || '';
  return {
    id: row.id,
    nguoiCaoTuoiId: row.nguoiCaoTuoiId,
    nguoiCaoTuoiTen: row.nguoiCaoTuoiTen,
    ngayKham: dateTime.slice(0, 10),
    gioKham: dateTime.slice(11, 16),
    noiKham: row.tenBenhVien,
    lyDoKham: row.lyDoKham,
    bacSiTen: row.bacSiPhuTrach,
    ketQua: row.ketQuaKham,
    trangThai: status.ma,
    trangThaiLabel: status.label,
    ghiChu: row.chuyenKhoa,
  };
};

const mapMobileAppointment = (row) => ({
  id: row.id,
  nguoiCaoTuoiId: row.nguoiCaoTuoiId,
  tenBenhVien: row.tenBenhVien,
  bacSiPhuTrach: row.bacSiPhuTrach,
  chuyenKhoa: row.chuyenKhoa,
  thoiGianKham: row.thoiGianKham,
  lyDoKham: row.lyDoKham,
  trangThai: row.trangThai,
  trangThaiLabel: STATUS[row.trangThai]?.label || row.trangThai,
  ketQuaKham: row.ketQuaKham,
});

const getMyElderlyId = async (pool, userId) => {
  const result = await pool.request()
    .input('userId', sql.Int, userId)
    .query(`SELECT NguoiCaoTuoiID AS id
            FROM HoSoNguoiCaoTuoi
            WHERE UserID=@userId AND TrangThai=N'DangTheoDoi'`);
  return result.recordset[0]?.id || null;
};

// GET /api/appointments?nguoiCaoTuoiId=&trangThai=&keyword=
const getAll = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, trangThai, keyword } = req.query;
    const pool = await poolPromise;
    let query = `
      SELECT l.LichKhamID AS id, l.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen, l.TenBenhVien AS tenBenhVien,
        l.BacSiPhuTrach AS bacSiPhuTrach, l.ChuyenKhoa AS chuyenKhoa,
        CONVERT(VARCHAR(19), l.ThoiGianKham, 126) AS thoiGianKham,
        l.LyDoKham AS lyDoKham, l.TrangThai AS trangThai,
        l.KetQuaKham AS ketQuaKham
      FROM LichKhamBenh l
      JOIN HoSoNguoiCaoTuoi nct ON l.NguoiCaoTuoiID=nct.NguoiCaoTuoiID
      WHERE 1=1`;
    const request = pool.request();
    if (nguoiCaoTuoiId) {
      query += ' AND l.NguoiCaoTuoiID=@nctId';
      request.input('nctId', sql.Int, Number(nguoiCaoTuoiId));
    }
    if (trangThai) {
      const dbStatus = normalizeStatus(trangThai);
      if (!dbStatus) return fail(res, 'Trạng thái lịch khám không hợp lệ', 'INVALID_STATUS', 400);
      query += ' AND l.TrangThai=@status';
      request.input('status', sql.NVarChar(20), dbStatus);
    }
    if (keyword?.trim()) {
      query += ' AND (nct.HoTen LIKE @keyword OR l.TenBenhVien LIKE @keyword)';
      request.input('keyword', sql.NVarChar(202), `%${keyword.trim()}%`);
    }
    query += scopedWhere(req, 'l.NguoiCaoTuoiID');
    query += ' ORDER BY l.ThoiGianKham DESC, l.LichKhamID DESC';
    const result = await request.query(query);
    return ok(res, result.recordset.map(mapWebAppointment));
  } catch (error) { next(error); }
};

// GET /api/elderly/me/appointments?trangThai=&tuNgay=&denNgay=
const getMine = async (req, res, next) => {
  try {
    const status = req.query.trangThai ? normalizeStatus(req.query.trangThai) : null;
    const from = req.query.tuNgay?.toString().trim() || null;
    const to = req.query.denNgay?.toString().trim() || null;
    if (req.query.trangThai && !status) {
      return fail(res, 'Trạng thái lịch khám không hợp lệ', 'INVALID_STATUS', 400);
    }
    if ((from && !isDateOnly(from)) || (to && !isDateOnly(to))) {
      return fail(res, 'tuNgay và denNgay phải có định dạng YYYY-MM-DD', 'INVALID_DATE', 400);
    }
    if (from && to && from > to) {
      return fail(res, 'tuNgay không được sau denNgay', 'INVALID_DATE_RANGE', 400);
    }

    const pool = await poolPromise;
    const elderlyId = await getMyElderlyId(pool, req.user.userId);
    if (!elderlyId) {
      return fail(res, 'Tài khoản chưa có hồ sơ người cao tuổi liên kết', 'ELDERLY_PROFILE_NOT_FOUND', 404);
    }
    const result = await pool.request()
      .input('elderlyId', sql.Int, elderlyId)
      .input('status', sql.NVarChar(20), status)
      .input('from', sql.VarChar(10), from)
      .input('to', sql.VarChar(10), to)
      .query(`
        SELECT LichKhamID AS id, NguoiCaoTuoiID AS nguoiCaoTuoiId,
          TenBenhVien AS tenBenhVien, BacSiPhuTrach AS bacSiPhuTrach,
          ChuyenKhoa AS chuyenKhoa,
          CONVERT(VARCHAR(19), ThoiGianKham, 126) AS thoiGianKham,
          LyDoKham AS lyDoKham, TrangThai AS trangThai,
          KetQuaKham AS ketQuaKham
        FROM LichKhamBenh
        WHERE NguoiCaoTuoiID=@elderlyId
          AND (@status IS NULL OR TrangThai=@status)
          AND (@from IS NULL OR ThoiGianKham >= CONVERT(DATE, @from, 23))
          AND (@to IS NULL OR ThoiGianKham < DATEADD(DAY, 1, CONVERT(DATE, @to, 23)))
        ORDER BY ThoiGianKham ASC, LichKhamID ASC`);
    return ok(res, result.recordset.map(mapMobileAppointment));
  } catch (error) { next(error); }
};

// GET /api/elderly/me/appointments/upcoming
const getUpcomingMine = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const elderlyId = await getMyElderlyId(pool, req.user.userId);
    if (!elderlyId) {
      return fail(res, 'Tài khoản chưa có hồ sơ người cao tuổi liên kết', 'ELDERLY_PROFILE_NOT_FOUND', 404);
    }
    const result = await pool.request()
      .input('elderlyId', sql.Int, elderlyId)
      .query(`
        SELECT TOP (5) LichKhamID AS id, NguoiCaoTuoiID AS nguoiCaoTuoiId,
          TenBenhVien AS tenBenhVien, BacSiPhuTrach AS bacSiPhuTrach,
          ChuyenKhoa AS chuyenKhoa,
          CONVERT(VARCHAR(19), ThoiGianKham, 126) AS thoiGianKham,
          LyDoKham AS lyDoKham, TrangThai AS trangThai,
          KetQuaKham AS ketQuaKham
        FROM LichKhamBenh
        WHERE NguoiCaoTuoiID=@elderlyId
          AND ThoiGianKham >= SYSDATETIME()
          AND TrangThai=N'ChuaDen'
        ORDER BY ThoiGianKham ASC, LichKhamID ASC`);
    return ok(res, result.recordset.map(mapMobileAppointment));
  } catch (error) { next(error); }
};

// GET /api/elderly/:id/appointments/upcoming
const getUpcomingByElderly = async (req, res, next) => {
  try {
    const elderlyId = Number(req.params.id);
    if (!Number.isInteger(elderlyId) || elderlyId < 1) {
      return fail(res, 'ID nguoi cao tuoi khong hop le', 'INVALID_ID', 400);
    }
    const pool = await poolPromise;
    const result = await pool.request()
      .input('elderlyId', sql.Int, elderlyId)
      .query(`
        SELECT TOP (5) LichKhamID AS id, NguoiCaoTuoiID AS nguoiCaoTuoiId,
          TenBenhVien AS tenBenhVien, BacSiPhuTrach AS bacSiPhuTrach,
          ChuyenKhoa AS chuyenKhoa,
          CONVERT(VARCHAR(19), ThoiGianKham, 126) AS thoiGianKham,
          LyDoKham AS lyDoKham, TrangThai AS trangThai,
          KetQuaKham AS ketQuaKham
        FROM LichKhamBenh
        WHERE NguoiCaoTuoiID=@elderlyId
          AND ThoiGianKham >= SYSDATETIME()
          AND TrangThai=N'ChuaDen'
        ORDER BY ThoiGianKham ASC, LichKhamID ASC`);
    return ok(res, result.recordset.map(mapMobileAppointment));
  } catch (error) { next(error); }
};

// POST /api/appointments - chi Web.
const create = async (req, res, next) => {
  try {
    const validationError = validateAppointmentBody(req.body);
    if (validationError) return fail(res, validationError, 'INVALID_APPOINTMENT', 400);
    const { nguoiCaoTuoiId, ngayKham, gioKham, noiKham, lyDoKham, bacSiTen, ghiChu } = req.body;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('nctId', sql.Int, Number(nguoiCaoTuoiId))
      .input('tenBenhVien', sql.NVarChar(200), noiKham.trim())
      .input('bacSi', sql.NVarChar(100), bacSiTen?.trim() || null)
      .input('chuyenKhoa', sql.NVarChar(100), ghiChu?.trim() || null)
      .input('ngayKham', sql.VarChar(10), ngayKham)
      .input('gioKham', sql.VarChar(5), gioKham)
      .input('lyDo', sql.NVarChar(300), lyDoKham?.trim() || null)
      .input('nguoiTaoId', sql.Int, req.user.userId)
      .query(`
        INSERT INTO LichKhamBenh
          (NguoiCaoTuoiID, TenBenhVien, BacSiPhuTrach, ChuyenKhoa,
           ThoiGianKham, LyDoKham, TrangThai, NguoiTaoID)
        OUTPUT INSERTED.LichKhamID AS id
        VALUES
          (@nctId, @tenBenhVien, @bacSi, @chuyenKhoa,
           CONVERT(DATETIME2, CONCAT(@ngayKham, 'T', @gioKham, ':00'), 126),
           @lyDo, N'ChuaDen', @nguoiTaoId)`);
    return ok(res, { id: result.recordset[0].id }, 'Thêm lịch khám thành công', 201);
  } catch (error) { next(error); }
};

// PUT /api/appointments/:id - chi Web.
const update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return fail(res, 'ID lịch khám không hợp lệ', 'INVALID_ID', 400);
    const validationError = validateAppointmentBody(req.body);
    if (validationError) return fail(res, validationError, 'INVALID_APPOINTMENT', 400);
    const { nguoiCaoTuoiId, ngayKham, gioKham, noiKham, lyDoKham, bacSiTen, ghiChu } = req.body;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('nctId', sql.Int, Number(nguoiCaoTuoiId))
      .input('tenBenhVien', sql.NVarChar(200), noiKham.trim())
      .input('bacSi', sql.NVarChar(100), bacSiTen?.trim() || null)
      .input('chuyenKhoa', sql.NVarChar(100), ghiChu?.trim() || null)
      .input('ngayKham', sql.VarChar(10), ngayKham)
      .input('gioKham', sql.VarChar(5), gioKham)
      .input('lyDo', sql.NVarChar(300), lyDoKham?.trim() || null)
      .query(`
        UPDATE LichKhamBenh SET
          NguoiCaoTuoiID=@nctId, TenBenhVien=@tenBenhVien,
          BacSiPhuTrach=@bacSi, ChuyenKhoa=@chuyenKhoa,
          ThoiGianKham=CONVERT(DATETIME2, CONCAT(@ngayKham, 'T', @gioKham, ':00'), 126),
          LyDoKham=@lyDo
        WHERE LichKhamID=@id;
        SELECT @@ROWCOUNT AS affectedRows`);
    if (!result.recordset[0]?.affectedRows) return fail(res, 'Không tìm thấy lịch khám', 'NOT_FOUND', 404);
    return ok(res, { id }, 'Cập nhật lịch khám thành công');
  } catch (error) { next(error); }
};

// PATCH /api/appointments/:id/cancel - chi Web.
const cancel = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return fail(res, 'ID lịch khám không hợp lệ', 'INVALID_ID', 400);
    const pool = await poolPromise;
    const result = await pool.request().input('id', sql.Int, id)
      .query(`UPDATE LichKhamBenh SET TrangThai=N'Huy'
              WHERE LichKhamID=@id AND TrangThai<>N'DaKham';
              SELECT @@ROWCOUNT AS affectedRows`);
    if (!result.recordset[0]?.affectedRows) {
      return fail(res, 'Không tìm thấy lịch khám hoặc lịch đã khám', 'APPOINTMENT_NOT_CANCELLABLE', 404);
    }
    return ok(res, { id }, 'Đã hủy lịch khám');
  } catch (error) { next(error); }
};

// PATCH /api/appointments/:id/result - ghi ket qua va danh dau DaKham, chi Web.
const recordResult = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const resultText = req.body?.ketQuaKham?.toString().trim();
    if (!Number.isInteger(id) || id < 1) return fail(res, 'ID lịch khám không hợp lệ', 'INVALID_ID', 400);
    if (!resultText) return fail(res, 'Kết quả khám là bắt buộc', 'MISSING_RESULT', 400);
    if (resultText.length > 500) return fail(res, 'Kết quả khám không được quá 500 ký tự', 'RESULT_TOO_LONG', 400);
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('result', sql.NVarChar(500), resultText)
      .query(`UPDATE LichKhamBenh
              SET KetQuaKham=@result, TrangThai=N'DaKham'
              WHERE LichKhamID=@id AND TrangThai<>N'Huy';
              SELECT @@ROWCOUNT AS affectedRows`);
    if (!result.recordset[0]?.affectedRows) {
      return fail(res, 'Không tìm thấy lịch khám hoặc lịch đã bị hủy', 'APPOINTMENT_NOT_UPDATABLE', 404);
    }
    return ok(res, { id, trangThai: 'DA_KHAM', ketQua: resultText }, 'Đã ghi kết quả khám');
  } catch (error) { next(error); }
};

module.exports = {
  getAll,
  getMine,
  getUpcomingMine,
  getUpcomingByElderly,
  create,
  update,
  cancel,
  recordResult,
};
