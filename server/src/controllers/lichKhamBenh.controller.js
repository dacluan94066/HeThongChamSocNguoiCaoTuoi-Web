// Lich kham benh: API quan ly tren Web va API chi-doc cho tai khoan Mobile.
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { todayVietnam } = require('../utils/vietnamDate');
const { scopedWhere, targetElderlyId } = require('../middlewares/mobile-scope.middleware');
const { emitToAdmin, emitToUser } = require('../socket');

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

const getAppointmentElderlyId = async (pool, appointmentId) => {
  try {
    const result = await pool.request()
      .input('appointmentId', sql.Int, appointmentId)
      .query(`SELECT NguoiCaoTuoiID AS id FROM LichKhamBenh
              WHERE LichKhamID=@appointmentId`);
    return result.recordset[0]?.id || null;
  } catch (error) {
    console.error('[SOCKET] Khong tim duoc chu lich kham:', error.message);
    return null;
  }
};

const emitAppointmentUpdate = async (pool, elderlyIds, data) => {
  emitToAdmin('lichkham:updated', data);
  const ids = [...new Set(elderlyIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return;
  try {
    const request = pool.request();
    const placeholders = ids.map((id, index) => {
      request.input(`elderlyId${index}`, sql.Int, id);
      return `@elderlyId${index}`;
    });
    const result = await request.query(`
      SELECT NguoiCaoTuoiID AS elderlyId, UserID AS userId
      FROM HoSoNguoiCaoTuoi
      WHERE NguoiCaoTuoiID IN (${placeholders.join(',')}) AND UserID IS NOT NULL`);
    for (const row of result.recordset) {
      emitToUser(row.userId, 'lichkham:updated', {
        ...data,
        nguoiCaoTuoiId: row.elderlyId,
      });
    }
  } catch (error) {
    // The database mutation already succeeded. Realtime is best-effort and the
    // Mobile polling fallback will still reconcile the authoritative API data.
    console.error('[SOCKET] Khong the gui lich kham toi Mobile:', error.message);
  }
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
        CONVERT(VARCHAR(19),l.ThoiGianKham,126) AS thoiGianKham, l.LyDoKham AS lyDoKham,
        l.TrangThai AS trangThai, l.KetQuaKham AS ketQuaKham
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
      request.input('status', sql.NVarChar, dbStatus);
    }
    if (keyword?.trim()) {
      query += ' AND (nct.HoTen LIKE @keyword OR l.TenBenhVien LIKE @keyword)';
      request.input('keyword', sql.NVarChar, `%${keyword.trim()}%`);
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
      .input('status', sql.NVarChar, status)
      .input('from', sql.VarChar, from)
      .input('to', sql.VarChar, to)
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
    if (ngayKham < todayVietnam()) {
      return fail(res, 'Ngày khám không được trước ngày hiện tại', 'PAST_APPOINTMENT_DATE', 400);
    }
    if (!targetElderlyId(req, Number(nguoiCaoTuoiId))) {
      return fail(res, 'Khong co quyen tao lich cho ho so nay', 'FORBIDDEN_ELDERLY', 403);
    }
    // Treat the entered Vietnam clock as a timezone-independent wall clock.
    // The UTC suffix prevents the Node host timezone from shifting the value
    // before the mssql driver writes it into the DATETIME2 column.
    const thoiGianKham = new Date(`${ngayKham}T${gioKham}:00Z`);
    const pool = await poolPromise;
    const result = await pool.request()
      .input('nctId', sql.Int, Number(nguoiCaoTuoiId))
      .input('tenBenhVien', sql.NVarChar, noiKham.trim())
      .input('bacSi', sql.NVarChar, bacSiTen?.trim() || null)
      .input('chuyenKhoa', sql.NVarChar, ghiChu?.trim() || null)
      .input('thoiGian', sql.DateTime2, thoiGianKham)
      .input('lyDo', sql.NVarChar, lyDoKham?.trim() || null)
      .input('nguoiTaoId', sql.Int, req.user.userId)
      .query(`
        INSERT INTO LichKhamBenh
          (NguoiCaoTuoiID, TenBenhVien, BacSiPhuTrach, ChuyenKhoa,
           ThoiGianKham, LyDoKham, TrangThai, NguoiTaoID)
        OUTPUT INSERTED.LichKhamID AS id
        VALUES
          (@nctId, @tenBenhVien, @bacSi, @chuyenKhoa,
           @thoiGian,
           @lyDo, N'ChuaDen', @nguoiTaoId)`);
    const eventData = { id: result.recordset[0].id, nguoiCaoTuoiId: Number(nguoiCaoTuoiId), action: 'created' };
    await emitAppointmentUpdate(pool, [Number(nguoiCaoTuoiId)], eventData);
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
    if (!targetElderlyId(req, Number(nguoiCaoTuoiId))) {
      return fail(res, 'Khong co quyen chuyen lich sang ho so nay', 'FORBIDDEN_ELDERLY', 403);
    }
    const thoiGianKham = new Date(`${ngayKham}T${gioKham}:00Z`);
    const pool = await poolPromise;
    const previous = await pool.request().input('id', sql.Int, id)
      .query(`SELECT NguoiCaoTuoiID AS elderlyId,
                     CONVERT(VARCHAR(10), ThoiGianKham, 23) AS ngayKham
              FROM LichKhamBenh WHERE LichKhamID=@id`);
    if (!previous.recordset.length) return fail(res, 'Không tìm thấy lịch khám', 'NOT_FOUND', 404);
    const previousElderlyId = previous.recordset[0].elderlyId;
    if (ngayKham < todayVietnam() && ngayKham !== previous.recordset[0].ngayKham) {
      return fail(res, 'Không thể đổi lịch khám sang ngày trước hiện tại', 'PAST_APPOINTMENT_DATE', 400);
    }
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('nctId', sql.Int, Number(nguoiCaoTuoiId))
      .input('tenBenhVien', sql.NVarChar, noiKham.trim())
      .input('bacSi', sql.NVarChar, bacSiTen?.trim() || null)
      .input('chuyenKhoa', sql.NVarChar, ghiChu?.trim() || null)
      .input('thoiGian', sql.DateTime2, thoiGianKham)
      .input('lyDo', sql.NVarChar, lyDoKham?.trim() || null)
      .query(`
        UPDATE LichKhamBenh SET
          NguoiCaoTuoiID=@nctId, TenBenhVien=@tenBenhVien,
          BacSiPhuTrach=@bacSi, ChuyenKhoa=@chuyenKhoa,
          ThoiGianKham=@thoiGian,
          LyDoKham=@lyDo
        WHERE LichKhamID=@id;
        DECLARE @affectedRows INT=@@ROWCOUNT;
        IF @affectedRows > 0
          DELETE FROM ThongBao
          WHERE LienKetID=@id AND LoaiThongBao=N'NhacLichKham'
            AND LienKetBang LIKE N'LichKhamBenh:%' AND DaDoc=0;
        SELECT @affectedRows AS affectedRows`);
    if (!result.recordset[0]?.affectedRows) return fail(res, 'Không tìm thấy lịch khám', 'NOT_FOUND', 404);
    await emitAppointmentUpdate(
      pool,
      [previousElderlyId, Number(nguoiCaoTuoiId)],
      { id, nguoiCaoTuoiId: Number(nguoiCaoTuoiId), action: 'updated' },
    );
    return ok(res, { id }, 'Cập nhật lịch khám thành công');
  } catch (error) { next(error); }
};

// PATCH /api/appointments/:id/cancel - chi Web.
const cancel = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return fail(res, 'ID lịch khám không hợp lệ', 'INVALID_ID', 400);
    const pool = await poolPromise;
    const elderlyId = await getAppointmentElderlyId(pool, id);
    const result = await pool.request().input('id', sql.Int, id)
      .query(`UPDATE LichKhamBenh SET TrangThai=N'Huy'
              WHERE LichKhamID=@id AND TrangThai<>N'DaKham';
              DECLARE @affectedRows INT=@@ROWCOUNT;
              IF @affectedRows > 0
                DELETE FROM ThongBao
                WHERE LienKetID=@id AND LoaiThongBao=N'NhacLichKham'
                  AND LienKetBang LIKE N'LichKhamBenh:%' AND DaDoc=0;
              SELECT @affectedRows AS affectedRows`);
    if (!result.recordset[0]?.affectedRows) {
      return fail(res, 'Không tìm thấy lịch khám hoặc lịch đã khám', 'APPOINTMENT_NOT_CANCELLABLE', 404);
    }
    await emitAppointmentUpdate(
      pool,
      [elderlyId],
      { id, nguoiCaoTuoiId: elderlyId, trangThai: 'HUY', action: 'cancelled' },
    );
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
    const elderlyId = await getAppointmentElderlyId(pool, id);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('result', sql.NVarChar, resultText)
      .query(`UPDATE LichKhamBenh
              SET KetQuaKham=@result, TrangThai=N'DaKham'
              WHERE LichKhamID=@id AND TrangThai<>N'Huy';
              DECLARE @affectedRows INT=@@ROWCOUNT;
              IF @affectedRows > 0
                DELETE FROM ThongBao
                WHERE LienKetID=@id AND LoaiThongBao=N'NhacLichKham'
                  AND LienKetBang LIKE N'LichKhamBenh:%' AND DaDoc=0;
              SELECT @affectedRows AS affectedRows`);
    if (!result.recordset[0]?.affectedRows) {
      return fail(res, 'Không tìm thấy lịch khám hoặc lịch đã bị hủy', 'APPOINTMENT_NOT_UPDATABLE', 404);
    }
    const eventData = { id, trangThai: 'DA_KHAM', ketQua: resultText, action: 'result-recorded' };
    await emitAppointmentUpdate(pool, [elderlyId], {
      ...eventData,
      nguoiCaoTuoiId: elderlyId,
    });
    return ok(res, eventData, 'Đã ghi kết quả khám');
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
