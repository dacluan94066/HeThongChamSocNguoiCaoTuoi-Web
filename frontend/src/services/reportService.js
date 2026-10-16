// Tổng hợp báo cáo từ các API nghiệp vụ hiện có, không tạo số liệu mẫu.
import axiosClient from './axiosClient';

const unwrap = (response) => response.data?.data ?? [];

const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const settledData = (result) => (result.status === 'fulfilled' ? unwrap(result.value) : null);

export const getHealthReport = async ({ from, to, nguoiCaoTuoiId } = {}) => {
  const params = {};
  if (from) params.from = from;
  if (to) params.to = to;
  if (nguoiCaoTuoiId) params.nguoiCaoTuoiId = nguoiCaoTuoiId;
  const response = await axiosClient.get('/reports/health-summary', { params });
  return response.data?.data ?? {};
};

const groupAlertsByRecentMonth = (alerts, monthCount = 6) => {
  const now = new Date();
  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1 - index), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      thang: `T${date.getMonth() + 1}/${date.getFullYear()}`,
      soLuong: 0,
    };
  });
  const byKey = new Map(months.map((item) => [item.key, item]));
  alerts.forEach((alert) => {
    const date = new Date(alert.thoiGianPhatHien);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.soLuong += 1;
  });
  return months.map(({ thang, soLuong }) => ({ thang, soLuong }));
};

export const getDashboardOverview = async () => {
  const results = await Promise.allSettled([
    axiosClient.get('/elderly'),
    axiosClient.get('/alerts'),
    axiosClient.get('/medication-schedules'),
    axiosClient.get('/appointments'),
  ]);

  const elders = settledData(results[0]);
  const alerts = settledData(results[1]);
  const schedules = settledData(results[2]);
  const appointments = settledData(results[3]);
  const today = localDateKey();
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndKey = localDateKey(weekEnd);

  const todaySchedules = schedules?.filter(
    (item) => String(item.thoiGianDuKien || '').slice(0, 10) === today,
  ) ?? null;
  const weekAppointments = appointments?.filter((item) => (
    item.ngayKham >= today
    && item.ngayKham <= weekEndKey
    && item.trangThai !== 'HUY'
  )) ?? null;
  const todayAppointments = appointments?.filter((item) => item.ngayKham === today)
    .sort((a, b) => (a.gioKham || '').localeCompare(b.gioKham || '')) ?? null;

  return {
    stats: {
      tongNguoiCaoTuoi: elders == null
        ? null
        : elders.filter((item) => item.trangThai === 'DangTheoDoi').length,
      soCanhBaoChuaXuLy: alerts == null
        ? null
        : alerts.filter((item) => item.trangThai === 'CHUA_XU_LY').length,
      soLichUongThuocHomNay: todaySchedules?.length ?? null,
      soLichUongThuocDaUong: todaySchedules == null
        ? null
        : todaySchedules.filter((item) => item.trangThaiHom_nay === 'DA_UONG').length,
      soLichKhamTuanNay: weekAppointments?.length ?? null,
    },
    latestAlerts: alerts?.slice(0, 4) ?? null,
    todayAppointments,
    alertsByMonth: alerts == null ? null : groupAlertsByRecentMonth(alerts),
  };
};

export const getDashboardStats = async () => {
  const { stats } = await getDashboardOverview();
  return stats;
};

export const getAlertsByMonth = async () => {
  const alerts = unwrap(await axiosClient.get('/alerts'));
  return groupAlertsByRecentMonth(alerts);
};

export const getMedicationCompliance = async () => {
  const schedules = unwrap(await axiosClient.get('/medication-schedules'));
  const elderMap = {};
  schedules.forEach((schedule) => {
    if (!elderMap[schedule.nguoiCaoTuoiId]) {
      elderMap[schedule.nguoiCaoTuoiId] = {
        ten: schedule.nguoiCaoTuoiTen,
        total: 0,
        daUong: 0,
      };
    }
    elderMap[schedule.nguoiCaoTuoiId].total += 1;
    if (schedule.trangThaiHom_nay === 'DA_UONG') {
      elderMap[schedule.nguoiCaoTuoiId].daUong += 1;
    }
  });
  return Object.values(elderMap).map((item) => ({
    ten: item.ten,
    tyLe: item.total > 0 ? Math.round((item.daUong / item.total) * 100) : 0,
  }));
};

export const getAlertsByLevel = async () => {
  const alerts = unwrap(await axiosClient.get('/alerts'));
  const map = { 'Thấp': 0, 'Trung bình': 0, 'Cao': 0, 'Khẩn cấp': 0 };
  alerts.forEach((alert) => {
    if (map[alert.mucDoLabel] !== undefined) map[alert.mucDoLabel] += 1;
  });
  return Object.entries(map).map(([mucDo, soLuong]) => ({ mucDo, soLuong }));
};

export const getHealthMetricsTrend = async () => {
  const metrics = unwrap(await axiosClient.get('/health-metrics', {
    params: { loaiChiSo: 'HUYET_AP' },
  }));
  const sorted = metrics
    .filter((metric) => metric.giaTri && String(metric.giaTri).includes('/'))
    .slice(0, 14)
    .reverse();
  return {
    huyetAp: sorted.map((metric) => {
      const parts = String(metric.giaTri).split('/');
      return {
        ngay: metric.ngayDo,
        tren: parseInt(parts[0], 10) || 0,
        duoi: parseInt(parts[1], 10) || 0,
      };
    }),
  };
};
