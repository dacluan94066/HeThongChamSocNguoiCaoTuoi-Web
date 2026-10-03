// Trang chỉ số sức khỏe - Bảng lịch sử + Biểu đồ đường theo thời gian
import React, { useState, useEffect } from 'react';
import { Select, Row, Col, Card, Tag, Button, Form, Input, DatePicker, TimePicker, message } from 'antd';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend,
} from 'chart.js';
import { getHealthMetrics, createHealthMetric } from '../../services/healthMetricService';
import { getElders } from '../../services/elderlyService';
import { EyeOutlined, HeartFilled, PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import StatusTag, { getHealthStatusMap } from '../../components/StatusTag';
import ModalForm, { FormSection } from '../../components/ModalForm';
import usePermission from '../../hooks/usePermission';
import dayjs from 'dayjs';
import TableAvatar from '../../components/TableAvatar';
import { formatEntityCode } from '../../utils/displayUtils';
import TableActionButton from '../../components/TableActionButton';
import RecordDetailModal from '../../components/RecordDetailModal';

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
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLCHISOSK', 'them');
  const [metrics, setMetrics] = useState([]);
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedElder, setSelectedElder] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => { getElders().then(setElders); }, []);
  useEffect(() => {
    setLoading(true);
    getHealthMetrics({ nguoiCaoTuoiId: selectedElder, loaiChiSo: selectedType || undefined })
      .then(setMetrics).finally(() => setLoading(false));
  }, [selectedElder, selectedType]);

  const handleAdd = () => {
    form.resetFields();
    form.setFieldsValue({ ngayDo: dayjs(), gioDo: dayjs(), binhThuong: true });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const result = await createHealthMetric({
        ...values,
        ngayDo: values.ngayDo?.format('YYYY-MM-DD'),
        gioDo: values.gioDo?.format('HH:mm'),
      });
      if (result.alertCreated) {
        message.warning('Chỉ số vượt ngưỡng — hệ thống đã tự động tạo cảnh báo');
      } else {
        message.success('Thêm chỉ số sức khỏe thành công');
      }
      setModalOpen(false);
      form.resetFields();
      getHealthMetrics({ nguoiCaoTuoiId: selectedElder, loaiChiSo: selectedType || undefined }).then(setMetrics);
    } finally {
      setSaving(false);
    }
  };

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
    { title: 'Mã bản ghi', key: 'maChiSo', width: 125, render: (_, record) => <span className="entity-code-badge">{formatEntityCode('CS', record.id)}</span> },
    { title: 'Ngày đo', dataIndex: 'ngayDo', key: 'ngayDo' },
    { title: 'Giờ đo', dataIndex: 'gioDo', key: 'gioDo' },
    {
      title: 'Người cao tuổi', dataIndex: 'nguoiCaoTuoiTen', key: 'nguoiCaoTuoiTen',
      sorter: (a, b) => a.nguoiCaoTuoiTen.localeCompare(b.nguoiCaoTuoiTen, 'vi'),
      render: (value) => <div className="table-person-cell"><TableAvatar name={value} /><span className="table-person-name">{value}</span></div>,
    },
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
      sorter: (a, b) => Number(a.binhThuong) - Number(b.binhThuong),
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
    {
      title: 'Thao tác', key: 'action', fixed: 'right', width: 82, align: 'center',
      render: (_, record) => <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setDetailRecord(record)} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Chỉ số sức khỏe"
        subtitle="Theo dõi lịch sử chỉ số sức khỏe của từng người cao tuổi"
        icon={<HeartFilled style={{ color: '#E15554' }} />}
        count={metrics.length}
        countLabel="bản ghi"
        extra={canCreate && (
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={handleAdd}>
            Thêm chỉ số
          </Button>
        )}
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
        emptyDescription="Chưa có chỉ số sức khỏe"
        emptyAction={canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm chỉ số</Button>}
        onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
        rowClassName={(r) => !r.binhThuong ? 'row-danger' : ''}
      />

      <RecordDetailModal
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết chỉ số — ${detailRecord?.nguoiCaoTuoiTen || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Mã bản ghi', key: 'id', render: (value) => formatEntityCode('CS', value) },
          { label: 'Người cao tuổi', key: 'nguoiCaoTuoiTen' },
          { label: 'Ngày đo', key: 'ngayDo' },
          { label: 'Giờ đo', key: 'gioDo' },
          { label: 'Loại chỉ số', key: 'loaiChiSoLabel' },
          { label: 'Giá trị', key: 'giaTri', render: (value, record) => `${value} ${record.donVi || ''}`.trim() },
          { label: 'Trạng thái', key: 'binhThuong', render: (value) => <StatusTag {...getHealthStatusMap(value)} /> },
          { label: 'Ghi chú', key: 'ghiChu' },
        ]}
      />

      <ModalForm
        title="Thêm chỉ số sức khỏe"
        subtitle="Ghi nhận kết quả đo và đánh giá tình trạng sức khỏe"
        icon={<HeartFilled />}
        mode="create"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        form={form}
      >
        <FormSection title="Thông tin phép đo" description="Chọn người cao tuổi, loại chỉ số và thời gian đo">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="nguoiCaoTuoiId" label="Người cao tuổi" rules={[{ required: true, message: 'Vui lòng chọn người cao tuổi' }]}>
                <Select placeholder="Chọn hồ sơ người cao tuổi" showSearch optionFilterProp="children">
                  {elders.map((e) => <Option key={e.id} value={e.id}>{e.hoTen}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="loaiChiSo" label="Loại chỉ số" rules={[{ required: true, message: 'Vui lòng chọn loại chỉ số' }]}>
                <Select placeholder="Chọn loại chỉ số sức khỏe">
                  {LOAI_CHI_SO.map((item) => <Option key={item.value} value={item.value}>{item.label} ({item.donVi})</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="ngayDo" label="Ngày đo" rules={[{ required: true, message: 'Vui lòng chọn ngày đo' }]}>
                <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày đo" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="gioDo" label="Giờ đo" rules={[{ required: true, message: 'Vui lòng chọn giờ đo' }]}>
                <TimePicker format="HH:mm" placeholder="Chọn giờ đo" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <FormSection title="Kết quả đo" description="Hệ thống tự đối chiếu ngưỡng cấu hình và tạo cảnh báo khi phát hiện bất thường">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="giaTri" label="Giá trị" rules={[{ required: true, message: 'Vui lòng nhập giá trị đo' }, { pattern: /^\d+(\.\d+)?(\/\d+(\.\d+)?)?$/, message: 'Giá trị không hợp lệ, ví dụ: 72 hoặc 120/80' }]}>
                <Input placeholder="VD: 72 hoặc 120/80" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="binhThuong" label="Đánh giá bổ sung" initialValue={true} rules={[{ required: true, message: 'Vui lòng chọn đánh giá' }]}>
                <Select placeholder="Chọn đánh giá bổ sung">
                  <Option value={true}>Để hệ thống tự đánh giá</Option>
                  <Option value={false}>Đánh dấu bất thường thủ công</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="ghiChu" label="Ghi chú">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Mô tả tình trạng khi đo hoặc lưu ý cần theo dõi" />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default HealthMetricsPage;
