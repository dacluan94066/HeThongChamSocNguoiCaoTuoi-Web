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
  const dt = row.thoiGianDuKien ? new Date(row.thoiGianDuKien) : null;
  return {
    id:               row.id,
    nguoiCaoTuoiId:   row.nguoiCaoTuoiId,
    nguoiCaoTuoiTen:  row.nguoiCaoTuoiTen,
    thuocId:          row.thuocId,
    tenThuoc:         row.tenThuoc,
    lieuDung:         row.lieuDung,
    gioBuoiSang:      null,
    gioBuoiTrua:      null,
    gioBuoiToi:       dt ? dt.toTimeString().slice(0, 5) : null,
    thoiGianDuKien:   row.thoiGianDuKien,
    trangThaiHom_nay: s.ma,
    trangThaiLabel:   s.label,
  };
};

// GET /api/medication-schedules?nguoiCaoTuoiId=&trangThai=
const getAll = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, trangThai } = req.query;
    const pool = await poolPromise;

    let query = `
      SELECT l.LichUongThuocID AS id, l.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen, dt.ThuocID AS thuocId, dm.TenThuoc AS tenThuoc,
        dt.LieuDung AS lieuDung, l.ThoiGianDuKien AS thoiGianDuKien,
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
      .input('thoiGianThucTe', sql.DateTime2, trangThai === 'DA_UONG' ? new Date() : null)
      .input('nguoiXacNhan', sql.Int, req.user.userId)
      .query(`UPDATE LichUongThuoc SET TrangThai=@trangThai,
              ThoiGianThucTe=@thoiGianThucTe, NguoiXacNhanID=@nguoiXacNhan
              WHERE LichUongThuocID=@id`);
    return ok(res, { id: parseInt(req.params.id), trangThai }, 'Cap nhat trang thai thanh cong');
  } catch (err) { next(err); }
};

module.exports = { getAll, updateStatus };
