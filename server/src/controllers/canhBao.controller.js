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

const SLA_PHUT = {
  KhanCap: 15,
  Cao: 60,
  TrungBinh: 360,
  Thap: 1440,
};

const getSmartInsights = (row) => {
  const severityScore = { Thap: 15, TrungBinh: 40, Cao: 68, KhanCap: 90 }[row.mucDo] || 20;
  const createdAt = new Date(row.ngayTao).getTime();
  const finishedAt = row.ngayXuLy ? new Date(row.ngayXuLy).getTime() : Date.now();
  const waitingMinutes = Math.max(0, Math.floor((finishedAt - createdAt) / 60000));
  const repeatCount = Number(row.soLanLap7Ngay || 1);
  const slaMinutes = SLA_PHUT[row.mucDo] || 1440;
  const isOpen = row.trangThai === 'ChuaXuLy' || row.trangThai === 'DaXem';

  let score = severityScore;
  if (row.loaiCanhBao === 'KhanCap') score += 10;
  if (row.loaiCanhBao === 'ChiSoBatThuong') score += 8;
  if (row.trangThai === 'ChuaXuLy') score += 5;
  if (waitingMinutes >= slaMinutes) score += 10;
  if (waitingMinutes >= slaMinutes * 2) score += 5;
  score += Math.min(12, Math.max(0, repeatCount - 1) * 3);
  if (!isOpen) score = 0;
  score = Math.min(100, score);

  const priority = score >= 85
    ? { ma: 'KHAN_CAP', label: 'Ưu tiên khẩn' }
    : score >= 65
      ? { ma: 'CAO', label: 'Ưu tiên cao' }
      : score >= 40
        ? { ma: 'TRUNG_BINH', label: 'Cần theo dõi' }
        : { ma: 'THAP', label: 'Theo dõi' };

  const reasons = [`Mức cảnh báo: ${MUC_DO[row.mucDo]?.label || row.mucDo}`];
  if (row.loaiCanhBao === 'ChiSoBatThuong') reasons.push('Liên quan đến chỉ số sức khỏe bất thường');
  if (row.loaiCanhBao === 'KhanCap') reasons.push('Được ghi nhận là tình huống khẩn cấp');
  if (repeatCount > 1) reasons.push(`Có ${repeatCount} cảnh báo trong 7 ngày gần đây`);
  if (isOpen && waitingMinutes >= slaMinutes) reasons.push('Đã vượt thời gian phản hồi đề xuất');
  else if (isOpen && waitingMinutes >= Math.floor(slaMinutes * 0.7)) reasons.push('Sắp đến hạn phản hồi');

  const recommendations = {
    KhanCap: 'Liên hệ ngay người cao tuổi/người chăm sóc và kích hoạt quy trình hỗ trợ khẩn cấp.',
    ChiSoBatThuong: 'Xác minh lại chỉ số, đối chiếu bệnh nền và chuyển nhân viên y tế đánh giá.',
    NhacUongThuoc: 'Liên hệ xác nhận việc dùng thuốc và ghi nhận nguyên nhân nếu bỏ lỡ.',
    NhacLichKham: 'Liên hệ xác nhận lịch khám và hỗ trợ đổi lịch khi cần.',
    Khac: 'Kiểm tra nội dung cảnh báo, liên hệ người phụ trách và ghi nhận kết quả xử lý.',
  };

  return {
    diemUuTien: score,
    uuTien: priority.ma,
    uuTienLabel: priority.label,
    lyDoUuTien: reasons,
    khuyenNghi: recommendations[row.loaiCanhBao] || recommendations.Khac,
    thoiGianChoPhut: waitingMinutes,
    slaPhut: slaMinutes,
    quaSla: isOpen && waitingMinutes >= slaMinutes,
    soLanCanhBao7Ngay: repeatCount,
  };
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
    ghiChuXuLy:       row.ghiChuXuLy,
    nguonBang:        row.nguonBang,
    nguonId:          row.nguonId,
    ...getSmartInsights(row),
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
        c.NgayTao AS ngayTao, c.NgayXuLy AS ngayXuLy, nd.HoTen AS nguoiXuLyTen,
        c.GhiChuXuLy AS ghiChuXuLy, c.NguonBang AS nguonBang, c.NguonID AS nguonId,
        (
          SELECT COUNT(*)
          FROM CanhBao c2
          WHERE c2.NguoiCaoTuoiID = c.NguoiCaoTuoiID
            AND c2.NgayTao >= DATEADD(DAY, -7, SYSDATETIME())
        ) AS soLanLap7Ngay
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
    const ghiChu = String(req.body.ghiChu || '').trim();
    if (!ghiChu) return fail(res, 'Vui long nhap ghi chu xu ly', 'VALIDATION_ERROR', 400);

    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('uid', sql.Int, req.user.userId)
      .input('ghiChu', sql.NVarChar(500), ghiChu)
      .query(`
        UPDATE CanhBao
        SET TrangThai=N'DaXuLy', NguoiXuLyID=@uid,
            NgayXuLy=SYSDATETIME(), GhiChuXuLy=@ghiChu
        WHERE CanhBaoID=@id AND TrangThai <> N'DaXuLy'
      `);
    if (!result.rowsAffected[0]) return fail(res, 'Canh bao khong ton tai hoac da duoc xu ly', 'ALERT_NOT_FOUND', 404);
    return ok(res, { id: parseInt(req.params.id) }, 'Da xu ly canh bao');
  } catch (err) { next(err); }
};

module.exports = { getAll, markSeen, resolve };
