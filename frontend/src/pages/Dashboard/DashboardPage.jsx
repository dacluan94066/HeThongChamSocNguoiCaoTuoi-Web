import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Empty, Progress, Spin } from 'antd';
import {
  AlertOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  HeartOutlined,
  MedicineBoxOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { formatAlertTime } from '../../utils/alertTime';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { getDashboardOverview } from '../../services/reportService';
import usePermission from '../../hooks/usePermission';
import StatusTag, {
  getAlertLevelStatus,
  getAlertStatusMap,
  getAppointmentStatusMap,
} from '../../components/StatusTag';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const capitalize = (value) => (value ? `${value[0].toUpperCase()}${value.slice(1)}` : '');

const DashboardKpi = ({ action, icon, label, tone = 'teal', value, children }) => (
  <article className={`dashboard-kpi dashboard-kpi-${tone}`}>
    <div className="dashboard-kpi-heading">
      <span className="dashboard-kpi-icon">{icon}</span>
      <span>{label}</span>
    </div>
    <div className="dashboard-kpi-value">{value}</div>
    <div className="dashboard-kpi-detail">{children}</div>
    {action && <div className="dashboard-kpi-action">{action}</div>}
  </article>
);

const LatestAlertCard = ({ alert, onOpen }) => {
  const level = getAlertLevelStatus(alert.mucDo);
  const status = getAlertStatusMap(alert.trangThai);
  return (
    <article className={`dashboard-alert-card dashboard-alert-${String(alert.mucDo || '').toLowerCase()}`}>
      <div className="dashboard-alert-topline">
        <StatusTag {...level} size="small" />
        <time>{formatAlertTime(alert.thoiGianPhatHien, true)}</time>
      </div>
      <div className="dashboard-alert-person">
        <span className="dashboard-alert-initial">
          {(alert.nguoiCaoTuoiTen || '?').trim().charAt(0).toUpperCase()}
        </span>
        <span>
          <strong>{alert.nguoiCaoTuoiTen || 'Chưa có tên'}</strong>
          <small>{alert.loaiCanhBaoLabel || 'Cảnh báo sức khỏe'}</small>
        </span>
      </div>
      <p>{alert.moTa || 'Không có nội dung cảnh báo.'}</p>
      <div className="dashboard-alert-footer">
        <StatusTag {...status} size="small" />
        <Button type="link" onClick={onOpen}>
          Xem chi tiết <ArrowRightOutlined />
        </Button>
      </div>
    </article>
  );
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const loadData = useCallback(async () => {
    try {
      setOverview(await getDashboardOverview());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const stats = overview?.stats || {};
  const medicationRate = stats.soLichUongThuocHomNay == null
    ? null
    : (stats.soLichUongThuocHomNay > 0
      ? Math.round((stats.soLichUongThuocDaUong / stats.soLichUongThuocHomNay) * 100)
      : 0);
  const canCreateProfile = hasPermission('QLHOSONCT', 'them');
  const canCreateMetric = hasPermission('QLCHISOSK', 'them');

  const currentDate = capitalize(new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(now));
  const currentTime = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(now);

  const chartData = useMemo(() => ({
    labels: (overview?.alertsByMonth || []).map((item) => item.thang),
    datasets: [{
      label: 'Số cảnh báo',
      data: (overview?.alertsByMonth || []).map((item) => item.soLuong),
      backgroundColor: '#7BC7C1',
      borderColor: '#0F5C63',
      borderWidth: 1,
      borderRadius: 8,
      borderSkipped: false,
      maxBarThickness: 52,
    }],
  }), [overview?.alertsByMonth]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#172B34',
        padding: 12,
        displayColors: false,
        callbacks: { label: (context) => `${context.parsed.y} cảnh báo` },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0, color: '#70838C' },
        grid: { color: '#EAF0F2' },
        border: { display: false },
      },
      x: {
        ticks: { color: '#70838C' },
        grid: { display: false },
        border: { display: false },
      },
    },
  };

  if (loading) {
    return <div className="page-loading"><Spin size="large" tip="Đang tải tổng quan..." /></div>;
  }

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-eyebrow"><HeartOutlined /> Hệ thống quản lý sức khỏe</span>
          <h1>Trung tâm Giám sát &amp; Quản lý Sức khỏe CareSenior</h1>
          <p className="dashboard-current-time"><ClockCircleOutlined /> {currentDate} · {currentTime}</p>
          <div className="dashboard-hero-summary">
            {stats.tongNguoiCaoTuoi != null && (
              <span><strong>{stats.tongNguoiCaoTuoi}</strong> người cao tuổi đang theo dõi</span>
            )}
            {stats.soCanhBaoChuaXuLy != null && (
              <span><strong>{stats.soCanhBaoChuaXuLy}</strong> cảnh báo cần xử lý</span>
            )}
          </div>
        </div>
        {(canCreateProfile || canCreateMetric) && (
          <div className="dashboard-hero-actions">
            {canCreateProfile && (
              <Button icon={<PlusOutlined />} onClick={() => navigate('/ho-so-nguoi-cao-tuoi')}>
                Thêm hồ sơ
              </Button>
            )}
            {canCreateMetric && (
              <Button icon={<HeartOutlined />} onClick={() => navigate('/chi-so-suc-khoe')}>
                Nhập chỉ số
              </Button>
            )}
          </div>
        )}
        <span className="dashboard-hero-decoration" aria-hidden="true"><HeartOutlined /></span>
      </section>

      <section className="dashboard-kpi-grid" aria-label="Chỉ số tổng quan">
        {stats.tongNguoiCaoTuoi != null && (
          <DashboardKpi
            icon={<TeamOutlined />}
            label="NCT đang theo dõi"
            value={stats.tongNguoiCaoTuoi}
          >
            Hồ sơ có trạng thái đang theo dõi
          </DashboardKpi>
        )}

        {stats.soCanhBaoChuaXuLy != null && (
          <DashboardKpi
            icon={<AlertOutlined />}
            label="Cảnh báo chưa xử lý"
            tone="danger"
            value={stats.soCanhBaoChuaXuLy}
            action={(
              <Button danger size="small" onClick={() => navigate('/canh-bao')}>
                Xử lý ngay
              </Button>
            )}
          >
            Cần được kiểm tra và tiếp nhận
          </DashboardKpi>
        )}

        {stats.soLichUongThuocHomNay != null && (
          <DashboardKpi
            icon={<MedicineBoxOutlined />}
            label="Lịch uống thuốc hôm nay"
            tone="success"
            value={stats.soLichUongThuocHomNay}
          >
            <div className="dashboard-medication-progress">
              <span>{stats.soLichUongThuocDaUong}/{stats.soLichUongThuocHomNay} đã uống</span>
              <strong>{medicationRate}%</strong>
            </div>
            <Progress percent={medicationRate} showInfo={false} strokeColor="#16A34A" trailColor="#DDEBE5" />
          </DashboardKpi>
        )}

        {stats.soLichKhamTuanNay != null && (
          <DashboardKpi
            icon={<CalendarOutlined />}
            label="Lịch khám tuần này"
            tone="warning"
            value={stats.soLichKhamTuanNay}
          >
            Lịch chưa hủy trong 7 ngày tới
          </DashboardKpi>
        )}
      </section>

      <section className="dashboard-main-grid">
        {overview?.latestAlerts != null && (
          <div className="dashboard-panel dashboard-alert-panel">
            <div className="dashboard-panel-header">
              <span>
                <small>CẬP NHẬT TỪ HỆ THỐNG</small>
                <h2><AlertOutlined /> Cảnh báo mới nhất</h2>
              </span>
              <Button type="link" onClick={() => navigate('/canh-bao')}>Xem tất cả</Button>
            </div>
            {overview.latestAlerts.length > 0 ? (
              <div className="dashboard-alert-grid">
                {overview.latestAlerts.map((alert) => (
                  <LatestAlertCard
                    key={alert.id}
                    alert={alert}
                    onOpen={() => navigate(`/canh-bao?highlight=${encodeURIComponent(alert.id)}`)}
                  />
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có cảnh báo" />
            )}
          </div>
        )}

        {overview?.todayAppointments != null && (
          <aside className="dashboard-panel dashboard-appointments-panel">
            <div className="dashboard-panel-header">
              <span>
                <small>LỊCH TRONG NGÀY</small>
                <h2><CalendarOutlined /> Lịch khám hôm nay</h2>
              </span>
              <strong className="dashboard-panel-count">{overview.todayAppointments.length}</strong>
            </div>
            {overview.todayAppointments.length > 0 ? (
              <div className="dashboard-timeline">
                {overview.todayAppointments.map((appointment) => {
                  const status = getAppointmentStatusMap(appointment.trangThai);
                  return (
                    <article className="dashboard-timeline-item" key={appointment.id}>
                      <time>{appointment.gioKham || '—'}</time>
                      <div>
                        <strong>{appointment.nguoiCaoTuoiTen || 'Chưa có tên'}</strong>
                        {appointment.noiKham && <span>{appointment.noiKham}</span>}
                        {appointment.lyDoKham && <small>{appointment.lyDoKham}</small>}
                        <StatusTag {...status} size="small" />
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Hôm nay chưa có lịch khám" />
            )}
            <Button block onClick={() => navigate('/lich-kham-benh')}>Xem lịch khám</Button>
          </aside>
        )}
      </section>

      {overview?.alertsByMonth != null && (
        <section className="dashboard-panel dashboard-chart-panel">
          <div className="dashboard-panel-header">
            <span>
              <small>DỮ LIỆU 6 THÁNG GẦN NHẤT</small>
              <h2><AlertOutlined /> Cảnh báo theo tháng</h2>
            </span>
          </div>
          <div className="dashboard-chart-canvas">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </section>
      )}

      {overview && Object.values(stats).every((value) => value == null) && (
        <div className="dashboard-no-data">
          <Empty description="Bạn chưa có quyền truy cập các nguồn dữ liệu tổng quan." />
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
