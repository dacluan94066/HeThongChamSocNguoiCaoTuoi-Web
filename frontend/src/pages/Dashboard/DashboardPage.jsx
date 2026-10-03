// Trang tổng quan Dashboard - Hiển thị thống kê và biểu đồ nhanh
import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Progress, Card, Spin, Tag } from 'antd';
import {
  TeamOutlined,
  BellOutlined,
  CalendarOutlined,
  MedicineBoxOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { getDashboardStats, getAlertsByMonth, getMedicationCompliance, getAlertsByLevel } from '../../services/reportService';
import SmartAlertCenter from '../../components/SmartAlertCenter';

// Đăng ký Chart.js
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement);

// Card thống kê
const StatCard = ({ icon, value, label, color, bgColor, trend }) => (
  <div
    className="stat-card fade-in-up"
    style={{ '--card-accent': color }}
  >
    <div className="stat-card-icon" style={{ background: bgColor }}>
      {React.cloneElement(icon, { style: { color } })}
    </div>
    <div className="stat-card-value" style={{ color }}>
      {value}
    </div>
    <div className="stat-card-label">{label}</div>
    {trend && (
      <div style={{ marginTop: 8, fontSize: 12, color: '#667085' }}>
        {trend}
      </div>
    )}
  </div>
);

const DashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [alertsByMonth, setAlertsByMonth] = useState([]);
  const [compliance, setCompliance] = useState([]);
  const [alertsByLevel, setAlertsByLevel] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [s, abm, comp, abl] = await Promise.all([
        getDashboardStats(),
        getAlertsByMonth(),
        getMedicationCompliance(),
        getAlertsByLevel(),
      ]);
      setStats(s);
      setAlertsByMonth(abm);
      setCompliance(comp);
      setAlertsByLevel(abl);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="page-loading">
        <Spin size="large" tip="Đang tải dữ liệu..." />
      </div>
    );
  }

  // Cấu hình biểu đồ cột - Cảnh báo theo tháng
  const barChartData = {
    labels: alertsByMonth.map((d) => d.thang),
    datasets: [
      {
        label: 'Số cảnh báo',
        data: alertsByMonth.map((d) => d.soLuong),
        backgroundColor: 'rgba(46, 125, 154, 0.2)',
        borderColor: '#2E7D9A',
        borderWidth: 2,
        borderRadius: 6,
      },
    ],
  };

  const barChartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: false },
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
      x: { grid: { display: false } },
    },
  };

  // Biểu đồ tròn - Phân loại cảnh báo
  const doughnutData = {
    labels: alertsByLevel.map((d) => d.mucDo),
    datasets: [
      {
        data: alertsByLevel.map((d) => d.soLuong),
        backgroundColor: ['#4CAF93', '#F5A623', '#E15554', '#C0392B'],
        borderWidth: 0,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    cutout: '65%',
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 16 } },
    },
  };

  // Tỉ lệ uống thuốc hôm nay
  const medicationRate = stats
    ? Math.round((stats.soLichUongThuocDaUong / stats.soLichUongThuocHomNay) * 100)
    : 0;

  return (
    <div>
      <PageHeader
        title="Tổng quan hệ thống"
        subtitle="Theo dõi toàn diện tình trạng sức khỏe người cao tuổi"
        icon={<DashboardOutlined />}
        extra={
          <Tag color="blue" style={{ fontSize: 13, padding: '5px 12px', borderRadius: 8 }}>
            📅 {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Tag>
        }
      />

      {/* Thống kê nhanh */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<TeamOutlined />}
            value={stats?.tongNguoiCaoTuoi || 0}
            label="Người cao tuổi đang theo dõi"
            color="#2E7D9A"
            bgColor="#EBF5FB"
            trend={`${stats?.soNguoiCanChamSocDacBiet || 0} người cần chăm sóc đặc biệt`}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<BellOutlined />}
            value={stats?.soCanhBaoChuaXuLy || 0}
            label="Cảnh báo chưa xử lý"
            color="#E15554"
            bgColor="#FDEEEE"
            trend="⚠️ Cần xử lý ngay"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<CalendarOutlined />}
            value={stats?.soLichKhamSapToi || 0}
            label="Lịch khám sắp tới"
            color="#F5A623"
            bgColor="#FEF6E6"
            trend="Trong vòng 7 ngày"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            icon={<MedicineBoxOutlined />}
            value={`${stats?.soLichUongThuocDaUong || 0}/${stats?.soLichUongThuocHomNay || 0}`}
            label="Lịch uống thuốc hôm nay"
            color="#4CAF93"
            bgColor="#E8F8F5"
            trend={`Đã uống ${medicationRate}%`}
          />
        </Col>
      </Row>

      {/* Trung tâm điều phối cảnh báo theo mức ưu tiên */}
      <div style={{ marginBottom: 24 }}>
        <SmartAlertCenter onChanged={loadData} />
      </div>

      {/* Thanh tiến trình uống thuốc */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24}>
          <Card
            title="📊 Tình trạng uống thuốc hôm nay"
            bordered={false}
            style={{ borderRadius: 12 }}
          >
            <Row gutter={32}>
              <Col xs={24} md={8}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>
                      <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />
                      Đã uống
                    </span>
                    <span style={{ fontWeight: 600, color: '#52c41a' }}>
                      {stats?.soLichUongThuocDaUong || 0} lịch
                    </span>
                  </div>
                  <Progress
                    percent={medicationRate}
                    strokeColor="#52c41a"
                    showInfo={false}
                    strokeWidth={10}
                    style={{ borderRadius: 10 }}
                  />
                </div>
              </Col>
              <Col xs={24} md={8}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>
                      <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />
                      Bỏ lỡ
                    </span>
                    <span style={{ fontWeight: 600, color: '#ff4d4f' }}>
                      {stats?.soLichUongThuocBoLo || 0} lịch
                    </span>
                  </div>
                  <Progress
                    percent={Math.round(((stats?.soLichUongThuocBoLo || 0) / (stats?.soLichUongThuocHomNay || 1)) * 100)}
                    strokeColor="#ff4d4f"
                    showInfo={false}
                    strokeWidth={10}
                  />
                </div>
              </Col>
              <Col xs={24} md={8}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: '#667085' }}>⏰ Chưa đến giờ</span>
                    <span style={{ fontWeight: 600, color: '#8c8c8c' }}>
                      {stats?.soLichUongThuocChuaDenGio || 0} lịch
                    </span>
                  </div>
                  <Progress
                    percent={Math.round(((stats?.soLichUongThuocChuaDenGio || 0) / (stats?.soLichUongThuocHomNay || 1)) * 100)}
                    strokeColor="#bfbfbf"
                    showInfo={false}
                    strokeWidth={10}
                  />
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* Biểu đồ */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <div className="chart-container">
            <div className="chart-title">📈 Số lượng cảnh báo theo tháng</div>
            <Bar data={barChartData} options={barChartOptions} height={85} />
          </div>
        </Col>
        <Col xs={24} lg={10}>
          <div className="chart-container" style={{ height: '100%' }}>
            <div className="chart-title">🔔 Phân loại cảnh báo theo mức độ</div>
            <div style={{ maxWidth: 280, margin: '0 auto' }}>
              <Doughnut data={doughnutData} options={doughnutOptions} />
            </div>
          </div>
        </Col>
      </Row>

      {/* Tỉ lệ tuân thủ uống thuốc */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title="💊 Tỉ lệ tuân thủ uống thuốc theo từng người"
            bordered={false}
            style={{ borderRadius: 12 }}
          >
            {compliance.map((item) => (
              <div key={item.ten} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{item.ten}</span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: item.tyLe >= 80 ? '#52c41a' : item.tyLe >= 60 ? '#faad14' : '#ff4d4f',
                    }}
                  >
                    {item.tyLe}%
                  </span>
                </div>
                <Progress
                  percent={item.tyLe}
                  showInfo={false}
                  strokeColor={
                    item.tyLe >= 80 ? '#52c41a' : item.tyLe >= 60 ? '#faad14' : '#ff4d4f'
                  }
                  strokeWidth={8}
                />
              </div>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
