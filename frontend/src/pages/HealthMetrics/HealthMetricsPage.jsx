// Trang chỉ số sức khỏe - Bảng lịch sử + Biểu đồ đường theo thời gian
import React, { useState, useEffect } from 'react';
import { Select, Row, Col, Card, Spin, Tag } from 'antd';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend,
} from 'chart.js';
import { getHealthMetrics } from '../../services/healthMetricService';
import { getElders } from '../../services/elderlyService';
import { HeartFilled } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import StatusTag, { getHealthStatusMap } from '../../components/StatusTag';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const { Option } = Select;

const LOAI_CHI_SO = [
  { value: 'HUYET_AP',   label: 'Huyết áp',   donVi: 'mmHg' },
  { value: 'NHIP_TIM',   label: 'Nhịp tim',   donVi: 'nhịp/phút' },
  { value: 'DUONG_HUYET',label: 'Đường huyết',donVi: 'mmol/L' },
  { value: 'SPO2',       label: 'SpO2',        donVi: '%' },
  { value: 'CAN_NANG',   label: 'Cân nặng',   donVi: 'kg' },
];

const HealthMetricsPage = () => {
  const [metrics, setMetrics] = useState([]);
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedElder, setSelectedElder] = useState(null);
  const [selectedType, setSelectedType] = useState(null);

  useEffect(() => { getElders().then(setElders); }, []);
  useEffect(() => {
    setLoading(true);
    getHealthMetrics({ nguoiCaoTuoiId: selectedElder, loaiChiSo: selectedType || undefined })
      .then(setMetrics).finally(() => setLoading(false));
  }, [selectedElder, selectedType]);

  const chartMetrics = metrics.filter((m) => m.loaiChiSo !== 'HUYET_AP' && !isNaN(Number(m.giaTri)));
  const lineData = {
    labels: chartMetrics.map((m) => `${m.ngayDo} ${m.gioDo}`),
    datasets: [{
      label: chartMetrics[0]?.loaiChiSoLabel || 'Chỉ số',
      data: chartMetrics.map((m) => Number(m.giaTri)),
      borderColor: '#2E7D9A',
      backgroundColor: 'rgba(46, 125, 154, 0.1)',
      pointRadius: chartMetrics.map((m) => (m.binhThuong ? 4 : 8)),
      pointBackgroundColor: chartMetrics.map((m) => (m.binhThuong ? '#4CAF93' : '#E15554')),
      fill: true,
      tension: 0.4,
      borderWidth: 2,
    }],
  };

  const lineOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      y: { beginAtZero: false, grid: { color: 'rgba(0,0,0,0.04)' } },
      x: { grid: { display: false } },
    },
  };

  const columns = [
    { title: 'Ngày đo', dataIndex: 'ngayDo', key: 'ngayDo' },
    { title: 'Giờ đo', dataIndex: 'gioDo', key: 'gioDo' },
    { title: 'Người cao tuổi', dataIndex: 'nguoiCaoTuoiTen', key: 'nguoiCaoTuoiTen' },
    {
      title: 'Loại chỉ số',
      dataIndex: 'loaiChiSoLabel',
      key: 'loaiChiSoLabel',
      render: (v) => (
        <Tag style={{ background: '#EBF5FB', color: '#2E7D9A', borderColor: '#A8D4E6' }}>{v}</Tag>
      ),
    },
    {
      title: 'Giá trị',
      key: 'giaTri',
      render: (_, r) => (
        <span style={{
          fontWeight: 700,
          fontSize: 16,
          color: r.binhThuong ? '#4CAF93' : '#E15554',
        }}>
          {r.giaTri} {r.donVi}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'binhThuong',
      key: 'binhThuong',
      render: (v) => {
        const { status, label } = getHealthStatusMap(v);
        return <StatusTag status={status} label={label} />;
      },
    },
    {
      title: 'Ghi chú',
      dataIndex: 'ghiChu',
      key: 'ghiChu',
      render: (v) => v || <span style={{ color: '#BFBFBF' }}>—</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Chỉ số sức khỏe"
        subtitle="Theo dõi lịch sử chỉ số sức khỏe của từng người cao tuổi"
        icon={<HeartFilled style={{ color: '#E15554' }} />}
      />

      <TableToolbar
        filters={[
          <Select
            key="elder"
            placeholder="Chọn người cao tuổi"
            style={{ width: 240 }}
            allowClear
            onChange={setSelectedElder}
          >
            {elders.map((e) => <Option key={e.id} value={e.id}>{e.hoTen}</Option>)}
          </Select>,
          <Select
            key="type"
            placeholder="Loại chỉ số"
            style={{ width: 180 }}
            allowClear
            onChange={setSelectedType}
          >
            {LOAI_CHI_SO.map((l) => <Option key={l.value} value={l.value}>{l.label}</Option>)}
          </Select>,
        ]}
        count={metrics.length}
        countLabel="bản ghi"
      />

      {/* Biểu đồ */}
      {chartMetrics.length > 0 && (
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col span={24}>
            <Card
              title="📈 Biểu đồ chỉ số theo thời gian"
              bordered={false}
              style={{ borderRadius: 12 }}
              extra={
                <span style={{ fontSize: 13, color: '#7A93A3' }}>
                  <span style={{ color: '#4CAF93' }}>●</span> Bình thường &nbsp;
                  <span style={{ color: '#E15554' }}>●</span> Bất thường
                </span>
              }
            >
              <Line data={lineData} options={lineOptions} height={70} />
            </Card>
          </Col>
        </Row>
      )}

      <DataTable
        columns={columns}
        dataSource={metrics}
        rowKey="id"
        loading={loading}
        totalLabel="bản ghi"
        rowClassName={(r) => !r.binhThuong ? 'row-danger' : ''}
      />
    </div>
  );
};

export default HealthMetricsPage;
