// reportService.js - Bao cao thong ke - goi API that
import axiosClient from './axiosClient';

// Lay thong ke tong hop cho Dashboard
export const getDashboardStats = async () => {
  try {
    const [eldersRes, alertsRes, scheduleRes, appointRes] = await Promise.all([
      axiosClient.get('/elderly'),
      axiosClient.get('/alerts'),
      axiosClient.get('/medication-schedules'),
      axiosClient.get('/appointments', { params: { trangThai: 'CHUA_DEN' } }),
    ]);

    const elders   = eldersRes.data?.data ?? [];
    const alerts   = alertsRes.data?.data ?? [];
    const schedules = scheduleRes.data?.data ?? [];
    const appoints  = appointRes.data?.data ?? [];

    const chuaXuLy = alerts.filter((a) => a.trangThai === 'CHUA_XU_LY').length;
    const daUong   = schedules.filter((s) => s.trangThaiHom_nay === 'DA_UONG').length;

    // Lap lich kham trong 7 ngay toi
    const today = new Date();
    const next7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sapToi = appoints.filter((a) => {
      const d = new Date(a.ngayKham);
      return d >= today && d <= next7;
    }).length;

    return {
      tongNguoiCaoTuoi:          elders.length,
      soNguoiCanChamSocDacBiet:  elders.filter((e) => e.trangThai === 'CanChamSocDacBiet').length,
      soCanhBaoChuaXuLy:         chuaXuLy,
      soLichKhamSapToi:           sapToi,
      soLichUongThuocHomNay:      schedules.length,
      soLichUongThuocDaUong:      daUong,
    };
  } catch {
    // Tra ve gia tri mac dinh neu loi
    return {
      tongNguoiCaoTuoi: 0, soNguoiCanChamSocDacBiet: 0,
      soCanhBaoChuaXuLy: 0, soLichKhamSapToi: 0,
      soLichUongThuocHomNay: 0, soLichUongThuocDaUong: 0,
    };
  }
};

// Lay so canh bao theo thang (6 thang gan nhat)
export const getAlertsByMonth = async () => {
  const res = await axiosClient.get('/alerts', { params: { trangThai: '' } });
  const alerts = res.data?.data ?? [];

  // Nhom theo thang
  const monthMap = {};
  alerts.forEach((a) => {
    if (!a.thoiGianPhatHien) return;
    const d = new Date(a.thoiGianPhatHien);
    const key = `T${d.getMonth() + 1}`;
    monthMap[key] = (monthMap[key] || 0) + 1;
  });

  return Object.entries(monthMap)
    .slice(-6)
    .map(([thang, soLuong]) => ({ thang, soLuong }));
};

// Lay ty le tuan thu uong thuoc theo tung nguoi
export const getMedicationCompliance = async () => {
  const res = await axiosClient.get('/medication-schedules');
  const schedules = res.data?.data ?? [];

  const elderMap = {};
  schedules.forEach((s) => {
    if (!elderMap[s.nguoiCaoTuoiId]) {
      elderMap[s.nguoiCaoTuoiId] = { ten: s.nguoiCaoTuoiTen, total: 0, daUong: 0 };
    }
    elderMap[s.nguoiCaoTuoiId].total++;
    if (s.trangThaiHom_nay === 'DA_UONG') elderMap[s.nguoiCaoTuoiId].daUong++;
  });

  return Object.values(elderMap).map((e) => ({
    ten: e.ten,
    tyLe: e.total > 0 ? Math.round((e.daUong / e.total) * 100) : 0,
  }));
};

// Lay so luong canh bao theo muc do
export const getAlertsByLevel = async () => {
  const res = await axiosClient.get('/alerts');
  const alerts = res.data?.data ?? [];

  const map = { 'Thấp': 0, 'Trung bình': 0, 'Cao': 0, 'Khẩn cấp': 0 };
  alerts.forEach((a) => {
    const label = a.mucDoLabel;
    if (map[label] !== undefined) map[label]++;
  });

  return Object.entries(map).map(([mucDo, soLuong]) => ({ mucDo, soLuong }));
};

// Lay xu huong huyet ap 7 ngay gan nhat
export const getHealthMetricsTrend = async () => {
  const res = await axiosClient.get('/health-metrics', { params: { loaiChiSo: 'HUYET_AP' } });
  const metrics = res.data?.data ?? [];

  const sorted = metrics
    .filter((m) => m.giaTri && String(m.giaTri).includes('/'))
    .slice(0, 14)
    .reverse();

  return {
    huyetAp: sorted.map((m) => {
      const parts = String(m.giaTri).split('/');
      return {
        ngay: m.ngayDo,
        tren: parseInt(parts[0]) || 0,
        duoi: parseInt(parts[1]) || 0,
      };
    }),
  };
};
