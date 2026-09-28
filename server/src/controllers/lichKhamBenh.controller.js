// controllers/lichKhamBenh.controller.js - Lich kham benh - dung schema that
// Bang LichKhamBenh: LichKhamID, NguoiCaoTuoiID, TenBenhVien, BacSiPhuTrach,
//   ChuyenKhoa, ThoiGianKham (DATETIME2), LyDoKham, TrangThai, KetQuaKham, NguoiTaoID
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

const STATUS = {
  ChuaDen:  { ma: 'CHUA_DEN', label: 'Chưa đến' },
  DaKham:   { ma: 'DA_KHAM',  label: 'Đã khám' },
  Huy:      { ma: 'HUY',      label: 'Hủy' },
  DaDoiLich:{ ma: 'DA_DOI_LICH', label: 'Đã đổi lịch' },
};

const mapAppt = (row) => {
  const s = STATUS[row.trangThai] || { ma: row.trangThai, label: row.trangThai };
  const dt = row.thoiGianKham ? new Date(row.thoiGianKham) : null;
  return {
    id:              row.id,
    nguoiCaoTuoiId:  row.nguoiCaoTuoiId,
    nguoiCaoTuoiTen: row.nguoiCaoTuoiTen,
    ngayKham:        dt ? dt.toISOString().slice(0, 10) : '',
    gioKham:         dt ? dt.toTimeString().slice(0, 5) : '',
    noiKham:         row.tenBenhVien,
    lyDoKham:        row.lyDoKham,
    bacSiTen:        row.bacSiPhuTrach,
    ketQua:          row.ketQuaKham,
    trangThai:       s.ma,
    trangThaiLabel:  s.label,
    ghiChu:          row.chuyenKhoa,
  };
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
        l.ThoiGianKham AS thoiGianKham, l.LyDoKham AS lyDoKham,
        l.TrangThai AS trangThai, l.KetQuaKham AS ketQuaKham
      FROM LichKhamBenh l
      JOIN HoSoNguoiCaoTuoi nct ON l.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
      WHERE 1=1
    `;
    const req2 = pool.request();
    if (nguoiCaoTuoiId) { query += ` AND l.NguoiCaoTuoiID=@nctId`; req2.input('nctId', sql.Int, parseInt(nguoiCaoTuoiId)); }
    if (trangThai) {
      const dbVal = Object.keys(STATUS).find((k) => STATUS[k].ma === trangThai) || trangThai;
      query += ` AND l.TrangThai=@tt`; req2.input('tt', sql.NVarChar, dbVal);
    }
    if (keyword && keyword.trim()) {
      query += ` AND (nct.HoTen LIKE @kw OR l.TenBenhVien LIKE @kw)`;
      req2.input('kw', sql.NVarChar, `%${keyword.trim()}%`);
    }
    query += ` ORDER BY l.ThoiGianKham DESC`;
    const result = await req2.query(query);
    return ok(res, result.recordset.map(mapAppt));
  } catch (err) { next(err); }
};

// POST /api/appointments
// Frontend gui: nguoiCaoTuoiId, ngayKham (YYYY-MM-DD), gioKham (HH:mm), noiKham, lyDoKham, bacSiTen
const create = async (req, res, next) => {
  try {
    const { nguoiCaoTuoiId, ngayKham, gioKham, noiKham, lyDoKham, bacSiTen, ghiChu } = req.body;
    if (!nguoiCaoTuoiId || !ngayKham || !gioKham || !noiKham)
      return fail(res, 'Thieu truong bat buoc', 'MISSING_FIELDS', 400);

    // Gop ngay + gio thanh DATETIME2
    const thoiGianKham = new Date(`${ngayKham}T${gioKham}:00`);

    const pool = await poolPromise;
    const r = await pool.request()
      .input('nctId', sql.Int, nguoiCaoTuoiId)
      .input('tenBenhVien', sql.NVarChar, noiKham)
      .input('bacSi', sql.NVarChar, bacSiTen || null)
      .input('chuyenKhoa', sql.NVarChar, ghiChu || null)
      .input('thoiGian', sql.DateTime2, thoiGianKham)
      .input('lyDo', sql.NVarChar, lyDoKham || null)
      .input('nguoiTaoId', sql.Int, req.user.userId)
      .query(`INSERT INTO LichKhamBenh (NguoiCaoTuoiID,TenBenhVien,BacSiPhuTrach,ChuyenKhoa,ThoiGianKham,LyDoKham,TrangThai,NguoiTaoID)
              OUTPUT INSERTED.LichKhamID AS id
              VALUES (@nctId,@tenBenhVien,@bacSi,@chuyenKhoa,@thoiGian,@lyDo,N'ChuaDen',@nguoiTaoId)`);
    return ok(res, { id: r.recordset[0].id }, 'Them lich kham thanh cong', 201);
  } catch (err) { next(err); }
};

// PATCH /api/appointments/:id/cancel
const cancel = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE LichKhamBenh SET TrangThai=N'Huy' WHERE LichKhamID=@id`);
    return ok(res, { id: parseInt(req.params.id) }, 'Da huy lich kham');
  } catch (err) { next(err); }
};

module.exports = { getAll, create, cancel };
