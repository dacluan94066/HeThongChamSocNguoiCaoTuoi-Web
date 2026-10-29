// controllers/lichUongThuoc.controller.js - Lich uong thuoc - dung schema that
// Schema: LichUongThuoc join DonThuocChiTiet join DonThuoc join DanhMucThuoc
// LichUongThuoc: LichUongThuocID, DonThuocChiTietID, NguoiCaoTuoiID,
//   ThoiGianDuKien (DATETIME2), ThoiGianThucTe, TrangThai, NguoiXacNhanID, GhiChu
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { scopedWhere } = require('../middlewares/mobile-scope.middleware');
const { emitToAdmin, emitToUser } = require('../socket');
const { todayVietnam } = require('../utils/vietnamDate');
const { attachSupplementHistory } = require('../utils/medicationSupplement');

const STATUS_MAP = {
  ChuaDenGio: { ma: 'CHUA_DEN_GIO', label: 'Chưa đến giờ' },
  DaUong:     { ma: 'DA_UONG',      label: 'Đã uống' },
  BoLo:       { ma: 'BO_LO',        label: 'Bỏ lỡ' },
  TuChoi:     { ma: 'TU_CHOI',      label: 'Từ chối' },
};

const mapSchedule = (row) => {
  const s = STATUS_MAP[row.trangThai] || { ma: row.trangThai, label: row.trangThai };
  const time = row.thoiGianDuKien?.slice(11, 16) || null;
  const hour = time ? Number(time.slice(0, 2)) : null;
  return {
    id:               row.id,
    nguoiCaoTuoiId:   row.nguoiCaoTuoiId,
    nguoiCaoTuoiTen:  row.nguoiCaoTuoiTen,
    thuocId:          row.thuocId,
    tenThuoc:         row.tenThuoc,
    lieuDung:         row.lieuDung,
    gioBuoiSang:      hour != null && hour < 11 ? time : null,
    gioBuoiTrua:      hour != null && hour >= 11 && hour < 17 ? time : null,
    gioBuoiToi:       hour != null && hour >= 17 ? time : null,
    thoiGianDuKien:   row.thoiGianDuKien,
    thoiGianThucTe:   row.thoiGianThucTe,
    nguoiXacNhanTen:  row.nguoiXacNhanTen,
    trangThaiHom_nay: s.ma,
    trangThaiLabel:   s.label,
  };
};

const mapMySchedule = (row) => ({
  id: row.id,
  nguoiCaoTuoiId: row.nguoiCaoTuoiId,
  donThuocChiTietId: row.donThuocChiTietId,
  thuocId: row.thuocId,
  tenThuoc: row.tenThuoc,
  lieuDung: row.lieuDung,
  cachDung: row.cachDung,
  thoiGianDuKien: row.thoiGianDuKien,
  thoiGianThucTe: row.thoiGianThucTe,
  trangThai: row.trangThai,
  ghiChu: row.ghiChu,
});

const isDateOnly = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
};

// GET /api/elderly/me/medication-schedule?tuNgay=&denNgay=
// Khoang ngay mac dinh la hom nay. NguoiCaoTuoiID luon duoc tra tu JWT,
// client khong duoc truyen ID cua ho so khac.
const getMine = async (req, res, next) => {
  try {
    const tuNgay = req.query.tuNgay?.toString().trim() || null;
    const denNgay = req.query.denNgay?.toString().trim() || null;
    if ((tuNgay && !isDateOnly(tuNgay)) || (denNgay && !isDateOnly(denNgay))) {
      return fail(res, 'tuNgay va denNgay phai co dinh dang YYYY-MM-DD', 'INVALID_DATE', 400);
    }
    if (tuNgay && denNgay && tuNgay > denNgay) {
      return fail(res, 'tuNgay khong duoc lon hon denNgay', 'INVALID_DATE_RANGE', 400);
    }

    const pool = await poolPromise;
    const profile = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query(`SELECT NguoiCaoTuoiID AS id
              FROM HoSoNguoiCaoTuoi
              WHERE UserID=@userId AND TrangThai IN (N'DangTheoDoi',N'CanChamSocDacBiet')`);
    if (!profile.recordset.length) {
      return fail(res, 'Tai khoan chua co ho so nguoi cao tuoi lien ket', 'ELDERLY_PROFILE_NOT_FOUND', 404);
    }

    const result = await pool.request()
      .input('nctId', sql.Int, profile.recordset[0].id)
      .input('tuNgay', sql.VarChar(10), tuNgay)
      .input('denNgay', sql.VarChar(10), denNgay)
      .query(`
        DECLARE @tu DATE = COALESCE(CONVERT(DATE, @tuNgay, 23), CONVERT(DATE, @denNgay, 23), CONVERT(DATE, DATEADD(HOUR,7,SYSUTCDATETIME())));
        DECLARE @den DATE = COALESCE(CONVERT(DATE, @denNgay, 23), CONVERT(DATE, @tuNgay, 23), CONVERT(DATE, DATEADD(HOUR,7,SYSUTCDATETIME())));

        SELECT l.LichUongThuocID AS id,
          l.NguoiCaoTuoiID AS nguoiCaoTuoiId,
          l.DonThuocChiTietID AS donThuocChiTietId,
          ct.ThuocID AS thuocId,
          dm.TenThuoc AS tenThuoc,
          ct.LieuDung AS lieuDung,
          ct.GhiChu AS cachDung,
          CONVERT(VARCHAR(19), l.ThoiGianDuKien, 126) AS thoiGianDuKien,
          CONVERT(VARCHAR(19), l.ThoiGianThucTe, 126) AS thoiGianThucTe,
          l.TrangThai AS trangThai,
          l.GhiChu AS ghiChu
        FROM LichUongThuoc l
        JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID=l.DonThuocChiTietID
        JOIN DonThuoc don ON don.DonThuocID=ct.DonThuocID AND don.NguoiCaoTuoiID=l.NguoiCaoTuoiID
        JOIN DanhMucThuoc dm ON dm.ThuocID=ct.ThuocID
        WHERE l.NguoiCaoTuoiID=@nctId
          AND l.ThoiGianDuKien >= @tu
          AND l.ThoiGianDuKien < DATEADD(DAY, 1, @den)
        ORDER BY l.ThoiGianDuKien ASC, l.LichUongThuocID ASC`);

    return ok(res, await attachSupplementHistory(pool, result.recordset.map(mapMySchedule)));
  } catch (err) { next(err); }
};

// GET /api/elderly/:id/medication-schedule?tuNgay=&denNgay=
const getByElderly = async (req, res, next) => {
  try {
    const elderlyId = Number(req.params.id);
    const tuNgay = req.query.tuNgay?.toString().trim() || null;
    const denNgay = req.query.denNgay?.toString().trim() || null;
    if (!Number.isInteger(elderlyId) || elderlyId < 1) {
      return fail(res, 'ID nguoi cao tuoi khong hop le', 'INVALID_ID', 400);
    }
    if ((tuNgay && !isDateOnly(tuNgay)) || (denNgay && !isDateOnly(denNgay))) {
      return fail(res, 'tuNgay va denNgay phai co dinh dang YYYY-MM-DD', 'INVALID_DATE', 400);
    }
    if (tuNgay && denNgay && tuNgay > denNgay) {
      return fail(res, 'tuNgay khong duoc lon hon denNgay', 'INVALID_DATE_RANGE', 400);
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('nctId', sql.Int, elderlyId)
      .input('tuNgay', sql.VarChar(10), tuNgay)
      .input('denNgay', sql.VarChar(10), denNgay)
      .query(`
        DECLARE @tu DATE = COALESCE(CONVERT(DATE, @tuNgay, 23), CONVERT(DATE, @denNgay, 23), CONVERT(DATE, GETDATE()));
        DECLARE @den DATE = COALESCE(CONVERT(DATE, @denNgay, 23), CONVERT(DATE, @tuNgay, 23), CONVERT(DATE, GETDATE()));

        SELECT l.LichUongThuocID AS id,
          l.NguoiCaoTuoiID AS nguoiCaoTuoiId,
          l.DonThuocChiTietID AS donThuocChiTietId,
          ct.ThuocID AS thuocId,
          dm.TenThuoc AS tenThuoc,
          ct.LieuDung AS lieuDung,
          ct.GhiChu AS cachDung,
          CONVERT(VARCHAR(19), l.ThoiGianDuKien, 126) AS thoiGianDuKien,
          CONVERT(VARCHAR(19), l.ThoiGianThucTe, 126) AS thoiGianThucTe,
          l.TrangThai AS trangThai,
          l.GhiChu AS ghiChu
        FROM LichUongThuoc l
        JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID=l.DonThuocChiTietID
        JOIN DanhMucThuoc dm ON dm.ThuocID=ct.ThuocID
        WHERE l.NguoiCaoTuoiID=@nctId
          AND l.ThoiGianDuKien >= @tu
          AND l.ThoiGianDuKien < DATEADD(DAY, 1, @den)
        ORDER BY l.ThoiGianDuKien ASC, l.LichUongThuocID ASC`);
    return ok(res, await attachSupplementHistory(pool, result.recordset.map(mapMySchedule)));
  } catch (error) { next(error); }
};

// PATCH /api/medication-schedule/:id/confirm
// Body: { trangThai: 'DaUong' | 'BoLo' | 'TuChoi' }
const confirmMine = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { trangThai } = req.body || {};
    if (!Number.isInteger(id) || id <= 0) {
      return fail(res, 'ID lich uong thuoc khong hop le', 'INVALID_ID', 400);
    }
    if (!['DaUong', 'BoLo', 'TuChoi'].includes(trangThai)) {
      return fail(res, 'Trạng thái chỉ nhận DaUong, BoLo hoặc TuChoi', 'INVALID_STATUS', 422);
    }

    const pool = await poolPromise;
    const ownership = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT l.LichUongThuocID AS id, nct.UserID AS ownerUserId,
                l.TrangThai AS previousStatus,
                CONVERT(VARCHAR(10),l.ThoiGianDuKien,23) AS scheduleDate,
                CONVERT(VARCHAR(19),l.ThoiGianDuKien,126) AS scheduledTime
              FROM LichUongThuoc l
              JOIN HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID=l.NguoiCaoTuoiID
              WHERE l.LichUongThuocID=@id AND nct.TrangThai IN (N'DangTheoDoi',N'CanChamSocDacBiet')`);
    if (!ownership.recordset.length) {
      return fail(res, 'Khong tim thay lich uong thuoc', 'MEDICATION_SCHEDULE_NOT_FOUND', 404);
    }
    if (Number(ownership.recordset[0].ownerUserId) !== Number(req.user.userId)) {
      return fail(res, 'Ban khong duoc phep cap nhat lich uong thuoc cua nguoi khac', 'FORBIDDEN', 403);
    }
    if (ownership.recordset[0].scheduleDate !== todayVietnam()) {
      return fail(res, 'Chỉ được xác nhận liều thuốc của ngày hôm nay', 'NOT_TODAY', 422);
    }
    const scheduledTime = ownership.recordset[0].scheduledTime;
    if (scheduledTime) {
      const scheduledMs = Date.parse(`${scheduledTime}+07:00`);
      if (!Number.isNaN(scheduledMs) && Date.now() < scheduledMs - 30 * 60 * 1000) {
        return fail(res, 'Chưa đến giờ uống thuốc. Bạn chỉ có thể xác nhận trước tối đa 30 phút.', 'TOO_EARLY', 422);
      }
    }

    const updated = await pool.request()
      .input('id', sql.Int, id)
      .input('trangThai', sql.NVarChar(20), trangThai)
      .input('previousStatus', sql.NVarChar(20), ownership.recordset[0].previousStatus)
      .input('nguoiXacNhanId', sql.Int, req.user.userId)
      .query(`
        UPDATE LichUongThuoc
        SET TrangThai=@trangThai,
            ThoiGianThucTe=CASE WHEN @trangThai=N'DaUong' THEN DATEADD(HOUR,7,SYSUTCDATETIME()) ELSE NULL END,
            NguoiXacNhanID=@nguoiXacNhanId
        WHERE LichUongThuocID=@id
          AND CAST(ThoiGianDuKien AS DATE)=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
          AND TrangThai=@previousStatus AND TrangThai<>N'DaUong' AND TrangThai<>@trangThai;
        DECLARE @affectedRows INT=@@ROWCOUNT;

        DELETE FROM ThongBao
        WHERE LienKetID=@id AND LienKetBang LIKE N'LichUongThuoc:%'
          AND LoaiThongBao=N'NhacThuoc' AND DaDoc=0 AND @affectedRows>0;

        SELECT l.LichUongThuocID AS id,
          l.NguoiCaoTuoiID AS nguoiCaoTuoiId,
          l.DonThuocChiTietID AS donThuocChiTietId,
          ct.ThuocID AS thuocId,
          dm.TenThuoc AS tenThuoc,
          ct.LieuDung AS lieuDung,
          ct.GhiChu AS cachDung,
          CONVERT(VARCHAR(19), l.ThoiGianDuKien, 126) AS thoiGianDuKien,
          CONVERT(VARCHAR(19), l.ThoiGianThucTe, 126) AS thoiGianThucTe,
          l.TrangThai AS trangThai,
          l.GhiChu AS ghiChu
        FROM LichUongThuoc l
        JOIN DonThuocChiTiet ct ON ct.DonThuocChiTietID=l.DonThuocChiTietID
        JOIN DanhMucThuoc dm ON dm.ThuocID=ct.ThuocID
        WHERE l.LichUongThuocID=@id AND @affectedRows>0`);

    if (!updated.recordset.length) {
      return fail(res, 'Liều thuốc đã được ghi nhận hoặc đã thay đổi. Vui lòng tải lại lịch trước khi thao tác.', 'DOSE_CHANGED', 409);
    }

    const schedule = mapMySchedule(updated.recordset[0]);
    emitToAdmin('lichuongthuoc:updated', schedule);
    emitToUser(ownership.recordset[0].ownerUserId, 'lichuongthuoc:updated', schedule);
    return ok(res, schedule, 'Cap nhat trang thai uong thuoc thanh cong');
  } catch (err) { next(err); }
};

// GET /api/medication-schedules?nguoiCaoTuoiId=&trangThai=
const getAll = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, trangThai } = req.query;
    const pool = await poolPromise;

    let query = `
      SELECT l.LichUongThuocID AS id, l.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen, dt.ThuocID AS thuocId, dm.TenThuoc AS tenThuoc,
        dt.LieuDung AS lieuDung,
        CONVERT(VARCHAR(19), l.ThoiGianDuKien, 126) AS thoiGianDuKien,
        CONVERT(VARCHAR(19), l.ThoiGianThucTe, 126) AS thoiGianThucTe,
        confirmer.HoTen AS nguoiXacNhanTen,
        l.TrangThai AS trangThai
      FROM LichUongThuoc l
      JOIN HoSoNguoiCaoTuoi nct ON l.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
      JOIN DonThuocChiTiet dt ON l.DonThuocChiTietID = dt.DonThuocChiTietID
      JOIN DanhMucThuoc dm ON dt.ThuocID = dm.ThuocID
      LEFT JOIN NguoiDung confirmer ON confirmer.UserID=l.NguoiXacNhanID
      WHERE 1=1
    `;
    const req2 = pool.request();
    if (nguoiCaoTuoiId) {
      query += ` AND l.NguoiCaoTuoiID=@nctId`;
      req2.input('nctId', sql.Int, parseInt(nguoiCaoTuoiId));
    }
    if (trangThai) {
      const dbVal = Object.keys(STATUS_MAP).find((k) => STATUS_MAP[k].ma === trangThai) || trangThai;
      query += ` AND l.TrangThai=@tt`;
      req2.input('tt', sql.NVarChar, dbVal);
    }
    query += scopedWhere(req, 'l.NguoiCaoTuoiID');
    query += ` ORDER BY l.ThoiGianDuKien DESC`;

    const result = await req2.query(query);
    return ok(res, await attachSupplementHistory(pool, result.recordset.map(mapSchedule)));
  } catch (err) { next(err); }
};

// PATCH /api/medication-schedules/:id/status
// Body: { trangThai: 'DA_UONG' | 'BO_LO' | 'TU_CHOI' }
const updateStatus = async (req, res, next) => {
  try {
    const { trangThai } = req.body || {};
    const dbVal = Object.keys(STATUS_MAP).find((k) => STATUS_MAP[k].ma === trangThai) || trangThai;
    if (!['DaUong', 'BoLo', 'TuChoi'].includes(dbVal)) {
      return fail(res, 'Trạng thái chỉ nhận DaUong, BoLo hoặc TuChoi', 'INVALID_STATUS', 422);
    }

    const pool = await poolPromise;
    const dose = await pool.request().input('id', sql.Int, req.params.id)
      .query(`SELECT CONVERT(VARCHAR(10),ThoiGianDuKien,23) AS scheduleDate,
                     CONVERT(VARCHAR(19),ThoiGianDuKien,126) AS scheduledTime,
                     TrangThai AS previousStatus
              FROM LichUongThuoc WHERE LichUongThuocID=@id`);
    if (!dose.recordset.length) return fail(res, 'Không tìm thấy lịch uống thuốc', 'MEDICATION_SCHEDULE_NOT_FOUND', 404);
    if (dose.recordset[0].scheduleDate !== todayVietnam()) {
      return fail(res, 'Chỉ được xác nhận liều thuốc của ngày hôm nay', 'NOT_TODAY', 422);
    }
    const scheduledTime = dose.recordset[0].scheduledTime;
    if (scheduledTime) {
      const scheduledMs = Date.parse(`${scheduledTime}+07:00`);
      if (!Number.isNaN(scheduledMs) && Date.now() < scheduledMs - 30 * 60 * 1000) {
        return fail(res, 'Chưa đến giờ uống thuốc. Bạn chỉ có thể xác nhận trước tối đa 30 phút.', 'TOO_EARLY', 422);
      }
    }
    const updated = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('trangThai', sql.NVarChar, dbVal)
      .input('previousStatus', sql.NVarChar(20), dose.recordset[0].previousStatus)
      .input('thoiGianThucTe', sql.DateTime2, dbVal === 'DaUong' ? new Date(Date.now()+7*3600000) : null)
      .input('nguoiXacNhan', sql.Int, req.user.userId)
      .query(`UPDATE LichUongThuoc SET TrangThai=@trangThai,
              ThoiGianThucTe=@thoiGianThucTe, NguoiXacNhanID=@nguoiXacNhan
              OUTPUT INSERTED.LichUongThuocID AS id,
                INSERTED.NguoiCaoTuoiID AS nguoiCaoTuoiId,
                INSERTED.TrangThai AS trangThai
              WHERE LichUongThuocID=@id
                AND CAST(ThoiGianDuKien AS DATE)=CAST(DATEADD(HOUR,7,SYSUTCDATETIME()) AS DATE)
                AND TrangThai=@previousStatus AND TrangThai<>N'DaUong' AND TrangThai<>@trangThai;
              DECLARE @affectedRows INT=@@ROWCOUNT;
              DELETE FROM ThongBao
              WHERE LienKetID=@id AND LienKetBang LIKE N'LichUongThuoc:%'
                AND LoaiThongBao=N'NhacThuoc' AND DaDoc=0 AND @affectedRows>0;`);
    // OUTPUT contains only rows won by the guarded UPDATE; a rejected write
    // must not retire reminders or emit a successful status change.
    if (!updated.rowsAffected[0] || !updated.recordset.length) {
      return fail(res, 'Liều thuốc đã được ghi nhận hoặc đã thay đổi. Vui lòng tải lại lịch trước khi thao tác.', 'DOSE_CHANGED', 409);
    }
    const eventData = {
      id: updated.recordset[0].id,
      nguoiCaoTuoiId: updated.recordset[0].nguoiCaoTuoiId,
      trangThai,
      trangThaiDb: updated.recordset[0].trangThai,
    };
    emitToAdmin('lichuongthuoc:updated', eventData);
    const owner = await pool.request()
      .input('elderlyId', sql.Int, eventData.nguoiCaoTuoiId)
      .query('SELECT UserID AS userId FROM HoSoNguoiCaoTuoi WHERE NguoiCaoTuoiID=@elderlyId');
    if (owner.recordset[0]?.userId) {
      emitToUser(owner.recordset[0].userId, 'lichuongthuoc:updated', eventData);
    }
    return ok(res, eventData, 'Cap nhat trang thai thanh cong');
  } catch (err) { next(err); }
};

module.exports = { getAll, updateStatus, getMine, getByElderly, confirmMine };
