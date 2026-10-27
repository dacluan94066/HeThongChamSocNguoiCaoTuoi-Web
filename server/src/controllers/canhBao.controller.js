// controllers/canhBao.controller.js - Canh bao - dung schema that
// Bang CanhBao: CanhBaoID, NguoiCaoTuoiID, LoaiCanhBao, NoiDung, MucDo,
//   TrangThai (ChuaXuLy|DaXem|DaXuLy|BoQua), NgayTao, NgayXuLy, NguoiXuLyID
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { scopedWhere } = require('../middlewares/mobile-scope.middleware');
const { emitToAdmin } = require('../socket');
const { alertTimestampSql, alertTiming } = require('../utils/alertTime');

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

const VALID_ALERT_TYPES = new Set(Object.keys(LOAI_CANH_BAO_LABEL));
const SEVERITY_INPUTS = new Map([
  ['Thap', 'Thap'],
  ['THAP', 'Thap'],
  ['TrungBinh', 'TrungBinh'],
  ['TRUNG_BINH', 'TrungBinh'],
  ['Cao', 'Cao'],
  ['CAO', 'Cao'],
  ['KhanCap', 'KhanCap'],
  ['KHAN_CAP', 'KhanCap'],
]);

const SLA_PHUT = {
  KhanCap: 15,
  Cao: 60,
  TrungBinh: 360,
  Thap: 1440,
};

const getSmartInsights = (row, now = Date.now()) => {
  const severityScore = { Thap: 15, TrungBinh: 40, Cao: 68, KhanCap: 90 }[row.mucDo] || 20;
  const timing = alertTiming(row.ngayTao, row.ngayXuLy, now);
  const waitingMinutes = timing.minutes;
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
    loiThoiGian: timing.error,
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

const parseDateOnly = (value) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return undefined;
  return value;
};

const getForElderly = async (req, res, next, elderlyId) => {
  const { loai, mucDo, tuNgay, denNgay } = req.query;
  if (loai && !VALID_ALERT_TYPES.has(loai)) {
    return fail(res, 'Loai canh bao khong hop le', 'INVALID_ALERT_TYPE', 400);
  }
  const normalizedSeverity = mucDo ? SEVERITY_INPUTS.get(mucDo) : null;
  if (mucDo && !normalizedSeverity) {
    return fail(res, 'Muc do canh bao khong hop le', 'INVALID_ALERT_SEVERITY', 400);
  }
  const fromDate = parseDateOnly(tuNgay);
  const toDate = parseDateOnly(denNgay);
  if (fromDate === undefined || toDate === undefined) {
    return fail(res, 'tuNgay va denNgay phai theo dinh dang YYYY-MM-DD', 'INVALID_DATE_RANGE', 400);
  }
  if (fromDate && toDate && fromDate > toDate) {
    return fail(res, 'tuNgay khong duoc lon hon denNgay', 'INVALID_DATE_RANGE', 400);
  }

  try {
    const pool = await poolPromise;
    const request = pool.request().input('elderlyId', sql.Int, elderlyId);
    let query = `
      SELECT c.CanhBaoID AS id, c.NguoiCaoTuoiID AS nguoiCaoTuoiId,
        nct.HoTen AS nguoiCaoTuoiTen, c.LoaiCanhBao AS loaiCanhBao,
        c.NoiDung AS noiDung, c.MucDo AS mucDo, c.TrangThai AS trangThai,
        ${alertTimestampSql('c.NgayTao')} AS ngayTao, ${alertTimestampSql('c.NgayXuLy')} AS ngayXuLy, nd.HoTen AS nguoiXuLyTen,
        c.GhiChuXuLy AS ghiChuXuLy, c.NguonBang AS nguonBang, c.NguonID AS nguonId,
        (
          SELECT COUNT(*)
          FROM CanhBao c2
          WHERE c2.NguoiCaoTuoiID = c.NguoiCaoTuoiID
            AND c2.NgayTao >= DATEADD(DAY, -7, SYSDATETIME())
        ) AS soLanLap7Ngay
      FROM CanhBao c
      JOIN HoSoNguoiCaoTuoi nct ON nct.NguoiCaoTuoiID = c.NguoiCaoTuoiID
      LEFT JOIN NguoiDung nd ON c.NguoiXuLyID = nd.UserID
      WHERE c.NguoiCaoTuoiID = @elderlyId
    `;
    if (loai) {
      request.input('loai', sql.NVarChar(30), loai);
      query += ' AND c.LoaiCanhBao = @loai';
    }
    if (normalizedSeverity) {
      request.input('mucDo', sql.NVarChar(20), normalizedSeverity);
      query += ' AND c.MucDo = @mucDo';
    }
    if (fromDate) {
      request.input('tuNgay', sql.Date, fromDate);
      query += ' AND c.NgayTao >= @tuNgay';
    }
    if (toDate) {
      request.input('denNgay', sql.Date, toDate);
      query += ' AND c.NgayTao < DATEADD(DAY, 1, @denNgay)';
    }
    query += ' ORDER BY c.NgayTao DESC, c.CanhBaoID DESC';
    const result = await request.query(query);
    return ok(res, result.recordset.map(mapAlert), 'Lay lich su canh bao thanh cong');
  } catch (error) {
    next(error);
  }
};

// GET /api/elderly/me/alerts
const getMine = async (req, res, next) => {
  if (req.user.tenVaiTro !== 'NguoiCaoTuoi') {
    return fail(res, 'Chi tai khoan nguoi cao tuoi duoc xem lich su cua minh', 'FORBIDDEN', 403);
  }
  const elderlyId = req.mobileElderlyIds?.[0];
  if (!elderlyId) {
    return fail(res, 'Tai khoan chua co ho so nguoi cao tuoi lien ket', 'ELDERLY_PROFILE_NOT_FOUND', 404);
  }
  return getForElderly(req, res, next, elderlyId);
};

// GET /api/elderly/:id/alerts
const getByElderly = (req, res, next) => {
  const elderlyId = Number(req.params.id);
  if (!Number.isInteger(elderlyId) || elderlyId < 1) {
    return fail(res, 'ID nguoi cao tuoi khong hop le', 'INVALID_ID', 400);
  }
  return getForElderly(req, res, next, elderlyId);
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
        ${alertTimestampSql('c.NgayTao')} AS ngayTao, ${alertTimestampSql('c.NgayXuLy')} AS ngayXuLy, nd.HoTen AS nguoiXuLyTen,
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
    query += scopedWhere(req, 'c.NguoiCaoTuoiID');
    query += ` ORDER BY c.NgayTao DESC`;
    const result = await req2.query(query);
    return ok(res, result.recordset.map(mapAlert));
  } catch (err) { next(err); }
};

const {endpoint}=require('../services/alertWorkflow.service');
const markSeen=endpoint(req=>({alertId:req.params.id,action:'seen'}));
const resolve=endpoint(req=>({alertId:req.params.id,action:'resolve',note:req.body.ghiChu}));
module.exports={getAll,markSeen,resolve,getSmartInsights};
