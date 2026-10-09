// controllers/lichUongThuoc.controller.js - Lich uong thuoc - dung schema that
// Schema: LichUongThuoc join DonThuocChiTiet join DonThuoc join DanhMucThuoc
// LichUongThuoc: LichUongThuocID, DonThuocChiTietID, NguoiCaoTuoiID,
//   ThoiGianDuKien (DATETIME2), ThoiGianThucTe, TrangThai, NguoiXacNhanID, GhiChu
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { scopedWhere } = require('../middlewares/mobile-scope.middleware');

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

    return ok(res, result.recordset.map(mapMySchedule));
  } catch (err) { next(err); }
};

// PATCH /api/medication-schedule/:id/confirm
// Body: { trangThai: 'DaUong' | 'BoLo' }
const confirmMine = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { trangThai } = req.body || {};
    if (!Number.isInteger(id) || id <= 0) {
      return fail(res, 'ID lich uong thuoc khong hop le', 'INVALID_ID', 400);
    }
    if (!['DaUong', 'BoLo'].includes(trangThai)) {
      return fail(res, 'trangThai chi nhan DaUong hoac BoLo', 'INVALID_STATUS', 400);
    }

    const pool = await poolPromise;
    const ownership = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT l.LichUongThuocID AS id, nct.UserID AS ownerUserId
              FROM LichUongThuoc l
              JOIN HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID=l.NguoiCaoTuoiID
              WHERE l.LichUongThuocID=@id AND nct.TrangThai IN (N'DangTheoDoi',N'CanChamSocDacBiet')`);
    if (!ownership.recordset.length) {
      return fail(res, 'Khong tim thay lich uong thuoc', 'MEDICATION_SCHEDULE_NOT_FOUND', 404);
    }
    if (Number(ownership.recordset[0].ownerUserId) !== Number(req.user.userId)) {
      return fail(res, 'Ban khong duoc phep cap nhat lich uong thuoc cua nguoi khac', 'FORBIDDEN', 403);
    }

    const updated = await pool.request()
      .input('id', sql.Int, id)
      .input('trangThai', sql.NVarChar(20), trangThai)
      .input('nguoiXacNhanId', sql.Int, req.user.userId)
      .query(`
        UPDATE LichUongThuoc
        SET TrangThai=@trangThai,
            ThoiGianThucTe=CASE WHEN @trangThai=N'DaUong' THEN DATEADD(HOUR,7,SYSUTCDATETIME()) ELSE NULL END,
            NguoiXacNhanID=@nguoiXacNhanId
        WHERE LichUongThuocID=@id;

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
        WHERE l.LichUongThuocID=@id`);

    return ok(res, mapMySchedule(updated.recordset[0]), 'Cap nhat trang thai uong thuoc thanh cong');
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
        l.TrangThai AS trangThai
      FROM LichUongThuoc l
      JOIN HoSoNguoiCaoTuoi nct ON l.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
      JOIN DonThuocChiTiet dt ON l.DonThuocChiTietID = dt.DonThuocChiTietID
      JOIN DanhMucThuoc dm ON dt.ThuocID = dm.ThuocID
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
    return ok(res, result.recordset.map(mapSchedule));
  } catch (err) { next(err); }
};

// PATCH /api/medication-schedules/:id/status
// Body: { trangThai: 'DA_UONG' | 'BO_LO' | 'CHUA_DEN_GIO' }
const updateStatus = async (req, res, next) => {
  try {
    const { trangThai } = req.body;
    const dbVal = Object.keys(STATUS_MAP).find((k) => STATUS_MAP[k].ma === trangThai) || trangThai;

    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('trangThai', sql.NVarChar, dbVal)
      .input('thoiGianThucTe', sql.DateTime2, trangThai === 'DA_UONG' ? new Date(Date.now()+7*3600000) : null)
      .input('nguoiXacNhan', sql.Int, req.user.userId)
      .query(`UPDATE LichUongThuoc SET TrangThai=@trangThai,
              ThoiGianThucTe=@thoiGianThucTe, NguoiXacNhanID=@nguoiXacNhan
              WHERE LichUongThuocID=@id`);
    return ok(res, { id: parseInt(req.params.id), trangThai }, 'Cap nhat trang thai thanh cong');
  } catch (err) { next(err); }
};

module.exports = { getAll, updateStatus, getMine, confirmMine };
