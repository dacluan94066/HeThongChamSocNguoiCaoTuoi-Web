const WINDOW_HOURS = 48;
const VIETNAM_OFFSET_MS = 7 * 3600000;
const vietnamWallTime = (instant) => new Date(instant.getTime() + VIETNAM_OFFSET_MS)
  .toISOString().slice(0, 19);

// An explicit timezone is required; never interpret a client clock in server time.
function validateSupplement(body, now = new Date()) {
  const value = body?.thoiGianThucTe;
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|\+07:00)$/.test(value)) {
    return { error: 'Vui lòng chọn thời điểm đã uống hợp lệ (có múi giờ Việt Nam hoặc UTC).' };
  }
  const date = new Date(value);
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59
    || (value.length >= 19 && /^\d{2}$/.test(value.slice(17, 19)) && Number(value.slice(17, 19)) > 59)) {
    return { error: 'Thời điểm đã uống không hợp lệ.' };
  }
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(calendar.getTime())
    || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    return { error: 'Thời điểm đã uống không hợp lệ.' };
  }
  if (date > now) return { error: 'Thời điểm đã uống không được ở tương lai.' };
  const reason = typeof body?.lyDo === 'string' ? body.lyDo.trim() : '';
  if (reason.length < 5 || reason.length > 300) {
    return { error: 'Lý do ghi nhận bổ sung phải từ 5 đến 300 ký tự.' };
  }
  return { takenAt: vietnamWallTime(date), reason };
}

function supplementEligibility(dose, takenAt) {
  if (Number(dose.canAccess) !== 1) return { status: 403, code: 'FORBIDDEN', message: 'Bạn không có quyền cập nhật liều thuốc này.' };
  if (!['BoLo', 'ChuaDenGio'].includes(dose.trangThai)) {
    return { status: 409, code: 'DOSE_CHANGED', message: 'Liều thuốc đã được ghi nhận hoặc từ chối. Vui lòng tải lại lịch.' };
  }
  const scheduled = dose.thoiGianDuKien;
  const now = dose.serverNow;
  if (scheduled.slice(0, 10) >= now.slice(0, 10)) {
    return { status: 422, code: 'NOT_PAST_DOSE', message: 'Ghi nhận bổ sung chỉ dành cho liều của ngày trước. Liều hôm nay dùng nút xác nhận hiện có.' };
  }
  if (Date.parse(`${now}Z`) - Date.parse(`${scheduled}Z`) > WINDOW_HOURS * 3600000) {
    return { status: 422, code: 'SUPPLEMENT_WINDOW_EXPIRED', message: 'Chỉ được ghi nhận bổ sung trong 48 giờ kể từ giờ uống dự kiến.' };
  }
  if (takenAt < `${scheduled.slice(0, 10)}T00:00:00` || takenAt > now) {
    return { status: 422, code: 'INVALID_TAKEN_TIME', message: 'Giờ đã uống phải từ ngày của liều thuốc đến hiện tại.' };
  }
  return null;
}

// Optional enrichment: existing schedules/reports continue to work before the
// explicit SQL patch is installed. Dynamic SQL avoids compiling a missing table.
async function attachSupplementHistory(pool, rows) {
  const ids = [...new Set(rows.map((row) => Number(row.id)))]
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return rows;
  const result = await pool.request().query(`
    IF OBJECT_ID(N'dbo.LichSuGhiNhanUongThuoc',N'U') IS NOT NULL
      EXEC(N'SELECT LichUongThuocID AS id, TrangThaiCu AS trangThaiCu,
        CONVERT(VARCHAR(19),ThoiGianThucTe,126) AS thoiGianThucTe,
        CONVERT(VARCHAR(19),NgayGhiNhan,126) AS ngayGhiNhan,
        NguoiGhiNhanTen AS nguoiGhiNhanTen, VaiTro AS vaiTro, LyDo AS lyDo
        FROM dbo.LichSuGhiNhanUongThuoc WHERE LichUongThuocID IN (${ids.join(',')})');
    ELSE SELECT CAST(NULL AS INT) AS id WHERE 1=0;
  `);
  const history = new Map((result.recordset || [])
    .filter((row) => row.ngayGhiNhan).map(({ id, ...record }) => [Number(id), record]));
  return rows.map((row) => ({ ...row, ghiNhanBoSung: history.get(Number(row.id)) || null }));
}

module.exports = { WINDOW_HOURS, validateSupplement, supplementEligibility, attachSupplementHistory };
