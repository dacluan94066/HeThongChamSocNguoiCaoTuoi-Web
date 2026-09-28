// Trang báo cáo thống kê - Biểu đồ tổng hợp, màu theme y tế
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Spin } from 'antd';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, ArcElement,
} from 'chart.js';
import {
  getAlertsByMonth, getMedicationCompliance, getAlertsByLevel, getHealthMetricsTrend,
} from '../../services/reportService';
import { BarChartOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement);

// Palette màu y tế
const CHART_COLORS = {
  primary:   '#2E7D9A',
  success:   '#4CAF93',
  warning:   '#F5A623',
  danger:    '#E15554',
  urgent:    '#C0392B',
  primaryBg: 'rgba(46, 125, 154, 0.15)',
  successBg: 'rgba(76, 175, 147, 0.15)',
  dangerBg:  'rgba(225, 85, 84, 0.15)',
};

const ReportsPage = () => {
  const [alertsByMonth, setAlertsByMonth] = useState([]);
  const [compliance, setCompliance] = useState([]);
  const [alertsByLevel, setAlertsByLevel] = useState([]);
  const [healthTrend, setHealthTrend] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAlertsByMonth(), getMedicationCompliance(), getAlertsByLevel(), getHealthMetricsTrend(),
    ]).then(([abm, comp, abl, ht]) => {
      setAlertsByMonth(abm); setCompliance(comp); setAlertsByLevel(abl); setHealthTrend(ht);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading"><Spin size="large" /></div>;

  const barAlerts = {
    labels: alertsByMonth.map((d) => d.thang),
    datasets: [{
      label: 'Số cảnh báo',
      data: alertsByMonth.map((d) => d.soLuong),
      backgroundColor: CHART_COLORS.primaryBg,
      borderColor: CHART_COLORS.primary,
      borderWidth: 2,
      borderRadius: 6,
    }],
  };

  const barCompliance = {
    labels: compliance.map((d) => d.ten),
    datasets: [{
      label: 'Tỉ lệ (%)',
      data: compliance.map((d) => d.tyLe),
      backgroundColor: compliance.map((d) =>
        d.tyLe >= 80 ? CHART_COLORS.successBg : d.tyLe >= 60 ? 'rgba(245,166,35,0.2)' : CHART_COLORS.dangerBg
      ),
      borderColor: compliance.map((d) =>
        d.tyLe >= 80 ? CHART_COLORS.success : d.tyLe >= 60 ? CHART_COLORS.warning : CHART_COLORS.danger
      ),
      borderWidth: 2,
      borderRadius: 6,
    }],
  };

  const doughnutData = {
    labels: alertsByLevel.map((d) => d.mucDo),
    datasets: [{
      data: alertsByLevel.map((d) => d.soLuong),
      backgroundColor: [CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger, CHART_COLORS.urgent],
      borderWidth: 0,
    }],
  };

  const lineBloodPressure = {
    labels: (healthTrend?.huyetAp || []).map((d) => d.ngay),
    datasets: [
      {
        label: 'Huyết áp tâm thu (mmHg)',
        data: (healthTrend?.huyetAp || []).map((d) => d.tren),
        borderColor: CHART_COLORS.danger,
        backgroundColor: CHART_COLORS.dangerBg,
        fill: true, tension: 0.4, borderWidth: 2,
      },
      {
        label: 'Huyết áp tâm trương (mmHg)',
        data: (healthTrend?.huyetAp || []).map((d) => d.duoi),
        borderColor: CHART_COLORS.primary,
        backgroundColor: CHART_COLORS.primaryBg,
        fill: true, tension: 0.4, borderWidth: 2,
      },
    ],
  };

  const commonOpts = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 13 }, padding: 16 } },
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
      x: { grid: { display: false } },
    },
  };

  return (
    <div>
      <PageHeader
        title="Báo cáo & Thống kê"
        subtitle="Tổng hợp dữ liệu sức khỏe và hoạt động chăm sóc"
        icon={<BarChartOutlined />}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="📈 Số cảnh báo theo tháng" bordered={false}>
            <Bar data={barAlerts} options={{ ...commonOpts, plugins: { legend: { display: false } } }} height={120} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="🔔 Phân loại cảnh báo theo mức độ" bordered={false}>
            <Doughnut
              data={doughnutData}
              options={{ ...commonOpts, cutout: '60%', scales: undefined }}
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="💊 Tỉ lệ tuân thủ uống thuốc theo từng người (%)" bordered={false}>
            <Bar
              data={barCompliance}
              options={{ ...commonOpts, indexAxis: 'y', plugins: { legend: { display: false } } }}
              height={80}
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="❤️ Xu hướng huyết áp theo ngày" bordered={false}>
            <Line data={lineBloodPressure} options={commonOpts} height={70} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ReportsPage;
