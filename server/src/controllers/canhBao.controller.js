// controllers/canhBao.controller.js - Canh bao - dung schema that
// Bang CanhBao: CanhBaoID, NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo,
//   TrangThai (ChuaXuLy|DaXem|DaXuLy|BoQua), NgayTao, NgayXuLy, NguoiXuLyID
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

const MUC_DO = {
  Thap:      { ma: 'THAP',       label: 'Thấp' },
  TrungBinh: { ma: 'TRUNG_BINH', label: 'Trung bình' },
  Cao:       { ma: 'CAO',        label: 'Cao' },
  KhanCap:   { ma: 'KHAN_CAP',   label: 'Khẩn cấp' },
};

const TRANG_THAI = {
  ChuaXuLy: { ma: 'CHUA_XU_LY', label: 'Chưa xử lý' },
  DaXem:    { ma: 'DA_XEM',     label: 'Đã xem' },
  DaXuLy:   { ma: 'DA_XU_LY',   label: 'Đã xử lý' },
  BoQua:    { ma: 'BO_QUA',     label: 'Bỏ qua' },
};

const LOAI_CANH_BAO_LABEL = {
  NhacUongThuoc:   'Nhắc uống thuốc',
  NhacLichKham:    'Nhắc lịch khám',
  ChiSoBatThuong:  'Chỉ số bất thường',
  KhanCap:         'Khẩn cấp',
  Khac:            'Khác',
};

const mapAlert = (row) => {
  const md = MUC_DO[row.mucDo] || { ma: row.mucDo, label: row.mucDo };
  const tt = TRANG_THAI[row.trangThai] || { ma: row.trangThai, label: row.trangThai };
  return {
    id:               row.id,
    nguoiCaoTuoiId:   row.nguoiCaoTuoiId,
    nguoiCaoTuoiTen:  row.nguoiCaoTuoiTen,
    loaiCanhBao:      row.loaiCanhBao,
    loaiCanhBaoLabel: LOAI_CANH_BAO_LABEL[row.loaiCanhBao] || row.loaiCanhBao,
    mucDo:            md.ma,
    mucDoLabel:       md.label,
    moTa:             row.noiDung,       // map NoiDung -> moTa cho frontend
    thoiGianPhatHien: row.ngayTao,
    trangThai:        tt.ma,
    trangThaiLabel:   tt.label,
    nguoiXuLy:        row.nguoiXuLyTen,
    thoiGianXuLy:     row.ngayXuLy,
    ghiChuXuLy:       null,
  };
};

// GET /api/alerts?mucDo=&trangThai=
const getAll = async (req, res, next) => {
  try {
    const { mucDo, trangThai } = req.query;
    const pool = await poolPromise;

    let query = `
      SELECT c.CanhBaoID AS id, c.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen, c.LoaiCanhBao AS loaiCanhBao,
        c.NoiDung AS noiDung, c.MucDo AS mucDo, c.TrangThai AS trangThai,
        c.NgayTao AS ngayTao, c.NgayXuLy AS ngayXuLy, nd.HoTen AS nguoiXuLyTen
      FROM CanhBao c
      JOIN HoSoNguoiCaoTuoi nct ON c.NguoiCaoTuoiID = nct.NguoiCaoTuoiID
      LEFT JOIN NguoiDung nd ON c.NguoiXuLyID = nd.UserID
      WHERE 1=1
    `;
    const req2 = pool.request();
    if (mucDo) {
      const dbVal = Object.keys(MUC_DO).find((k) => MUC_DO[k].ma === mucDo) || mucDo;
      query += ` AND c.MucDo = @mucDo`; req2.input('mucDo', sql.NVarChar, dbVal);
    }
    if (trangThai) {
      const dbVal = Object.keys(TRANG_THAI).find((k) => TRANG_THAI[k].ma === trangThai) || trangThai;
      query += ` AND c.TrangThai = @trangThai`; req2.input('trangThai', sql.NVarChar, dbVal);
    }
    query += ` ORDER BY c.NgayTao DESC`;
    const result = await req2.query(query);
    return ok(res, result.recordset.map(mapAlert));
  } catch (err) { next(err); }
};

// PATCH /api/alerts/:id/seen
const markSeen = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, req.params.id).input('uid', sql.Int, req.user.userId)
      .query(`UPDATE CanhBao SET TrangThai=N'DaXem', NguoiXuLyID=@uid WHERE CanhBaoID=@id AND TrangThai=N'ChuaXuLy'`);
    return ok(res, { id: parseInt(req.params.id) }, 'Da danh dau da xem');
  } catch (err) { next(err); }
};

// PATCH /api/alerts/:id/resolve
const resolve = async (req, res, next) => {
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, req.params.id).input('uid', sql.Int, req.user.userId)
      .query(`UPDATE CanhBao SET TrangThai=N'DaXuLy', NguoiXuLyID=@uid, NgayXuLy=SYSDATETIME() WHERE CanhBaoID=@id`);
    return ok(res, { id: parseInt(req.params.id) }, 'Da xu ly canh bao');
  } catch (err) { next(err); }
};

module.exports = { getAll, markSeen, resolve };
