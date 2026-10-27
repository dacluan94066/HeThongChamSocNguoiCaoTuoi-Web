import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Col, DatePicker, Form, Input, message, Row, Select, Tag, TimePicker,
} from 'antd';
import { Line } from 'react-chartjs-2';
import {
  CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement,
  PointElement, Title, Tooltip,
} from 'chart.js';
import {
  CloudOutlined, DashboardOutlined, ExperimentOutlined, FireOutlined,
  HeartFilled, HeartOutlined, PlusOutlined, SwapOutlined,
} from '@ant-design/icons';
import { metricTime, metricNow } from '../../utils/healthMetricTime';
import {
  createHealthMetric, getHealthMetrics, getHealthMetricTypes,
} from '../../services/healthMetricService';
import { getElders } from '../../services/elderlyService';
import DataTable from '../../components/DataTable';
import StatusTag, { getHealthStatusMap } from '../../components/StatusTag';
import ModalForm, { FormSection } from '../../components/ModalForm';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import { formatEntityCode } from '../../utils/displayUtils';
import RecordDetailModal from '../../components/RecordDetailModal';
import { getSocket } from '../../services/socketClient';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend);

const TYPE_META = {
  'Huyết áp': { code: 'HUYET_AP', shortLabel: 'Huyết áp', icon: HeartFilled, color: '#c43d35' },
  'Nhịp tim': { code: 'NHIP_TIM', shortLabel: 'Nhịp tim', icon: HeartOutlined, color: '#d85a61' },
  'Đường huyết': { code: 'DUONG_HUYET', shortLabel: 'Đường huyết', icon: ExperimentOutlined, color: '#b76e00' },
  'Nhiệt độ cơ thể': { code: 'NHIET_DO', shortLabel: 'Nhiệt độ', icon: FireOutlined, color: '#d97706' },
  SpO2: { code: 'SPO2', shortLabel: 'SpO2', icon: CloudOutlined, color: '#26728c' },
  'Cân nặng': { code: 'CAN_NANG', shortLabel: 'Cân nặng', icon: DashboardOutlined, color: '#16864a' },
};

const PERIOD_OPTIONS = [
  { value: '24h', label: '24 giờ' },
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
];

const normalRangePlugin = {
  id: 'normalRange',
  beforeDatasetsDraw(chart, _args, options) {
    const { chartArea, ctx, scales } = chart;
    if (!chartArea || !scales?.y || !Array.isArray(options?.ranges)) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    ctx.clip();
    options.ranges.forEach((range) => {
      if (range.min == null || range.max == null) return;
      const top = scales.y.getPixelForValue(range.max);
      const bottom = scales.y.getPixelForValue(range.min);
      ctx.fillStyle = range.color || 'rgba(22, 163, 74, .08)';
      ctx.fillRect(chartArea.left, top, chartArea.width, bottom - top);
    });
    ctx.restore();
  },
};

const enrichType = (type) => ({
  ...type,
  ...(TYPE_META[type.tenChiSo] || {
    code: type.tenChiSo,
    shortLabel: type.tenChiSo,
    icon: HeartOutlined,
    color: '#0f5c63',
  }),
});

const primaryValue = (metric) => {
  if (metric.giaTriChinh != null) return Number(metric.giaTriChinh);
  return Number(String(metric.giaTri ?? '').split('/')[0]);
};

const secondaryValue = (metric) => {
  if (metric.giaTriPhu != null) return Number(metric.giaTriPhu);
  const part = String(metric.giaTri ?? '').split('/')[1];
  return part == null ? null : Number(part);
};

const isAbnormal = (metric) => metric.laBatThuong != null
  ? Boolean(metric.laBatThuong)
  : !metric.binhThuong;

const formatValue = (value) => {
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const metricDisplayValue = (metric) => {
  if (!metric) return 'Chưa có dữ liệu';
  const primary = primaryValue(metric);
  const secondary = secondaryValue(metric);
  const value = secondary == null
    ? formatValue(primary)
    : `${formatValue(primary)}/${formatValue(secondary)}`;
  return `${value} ${metric.donVi || ''}`.trim();
};

const isOutsideRange = (value, min, max, fallbackAbnormal) => {
  if (!Number.isFinite(value)) return false;
  if (min == null && max == null) return fallbackAbnormal;
  return (min != null && value < Number(min)) || (max != null && value > Number(max));
};

const HealthMetricsPage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLCHISOSK', 'them');
  const [metrics, setMetrics] = useState([]);
  const [metricTypes, setMetricTypes] = useState([]);
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedElder, setSelectedElder] = useState(null);
  const [selectedType, setSelectedType] = useState('HUYET_AP');
  const [period, setPeriod] = useState('7d');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    let active = true;
    Promise.all([getElders(), getHealthMetricTypes()])
      .then(([elderData, typeData]) => {
        if (!active) return;
        const types = typeData.map(enrichType);
        setElders(elderData);
        setMetricTypes(types);
        setSelectedElder(elderData[0]?.id || null);
        setSelectedType(types[0]?.code || 'HUYET_AP');
        if (!elderData.length) setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setElders([]);
        setMetricTypes([]);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedElder) return undefined;
    let active = true;
    getHealthMetrics({ nguoiCaoTuoiId: selectedElder })
      .then((data) => { if (active) setMetrics(data); })
      .catch(() => { if (active) setMetrics([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedElder]);

  useEffect(() => {
    const socket = getSocket();
    const handleNewHealthMetric = (payload = {}) => {
      if (!selectedElder || (payload.nguoiCaoTuoiId
        && Number(payload.nguoiCaoTuoiId) !== Number(selectedElder))) return;
      getHealthMetrics({ nguoiCaoTuoiId: selectedElder }).then(setMetrics).catch(() => {});
    };
    socket.on('chisuckhoe:new', handleNewHealthMetric);
    return () => socket.off('chisuckhoe:new', handleNewHealthMetric);
  }, [selectedElder]);

  const selectedProfile = useMemo(
    () => elders.find((elder) => Number(elder.id) === Number(selectedElder)) || null,
    [elders, selectedElder],
  );
  const currentType = useMemo(
    () => metricTypes.find((type) => type.code === selectedType) || null,
    [metricTypes, selectedType],
  );

  const latestByType = useMemo(() => {
    const result = {};
    [...metrics]
      .sort((a, b) => metricTime(b).valueOf() - metricTime(a).valueOf())
      .forEach((metric) => {
        if (!result[metric.loaiChiSo]) result[metric.loaiChiSo] = metric;
      });
    return result;
  }, [metrics]);

  const periodMetrics = useMemo(() => {
    const now = metricNow();
    const start = period === '24h'
      ? now.subtract(24, 'hour')
      : now.subtract(period === '7d' ? 7 : 30, 'day').startOf('day');
    return metrics
      .filter((metric) => metric.loaiChiSo === selectedType)
      .filter((metric) => metricTime(metric).isValid() && !metricTime(metric).isBefore(start))
      .sort((a, b) => metricTime(a).valueOf() - metricTime(b).valueOf());
  }, [metrics, period, selectedType]);

  const chartData = useMemo(() => {
    const labels = periodMetrics.map((metric) => (
      period === '24h' ? metricTime(metric).format('HH:mm') : metricTime(metric).format('DD/MM')
    ));
    const mainPoints = periodMetrics.map(primaryValue);
    const mainAbnormal = periodMetrics.map((metric) => isOutsideRange(
      primaryValue(metric), currentType?.giaTriMin, currentType?.giaTriMax, isAbnormal(metric),
    ));
    const datasets = [{
      label: selectedType === 'HUYET_AP' ? 'Tâm thu' : (currentType?.shortLabel || 'Chỉ số'),
      data: mainPoints,
      borderColor: '#0f5c63',
      backgroundColor: 'rgba(15, 92, 99, .08)',
      pointBackgroundColor: mainAbnormal.map((abnormal) => (abnormal ? '#b42318' : '#0f5c63')),
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: mainAbnormal.map((abnormal) => (abnormal ? 6 : 4)),
      fill: selectedType !== 'HUYET_AP',
      tension: .32,
      borderWidth: 2,
    }];
    if (selectedType === 'HUYET_AP') {
      const secondaryPoints = periodMetrics.map(secondaryValue);
      const secondaryAbnormal = periodMetrics.map((metric) => isOutsideRange(
        secondaryValue(metric), currentType?.giaTriMin2, currentType?.giaTriMax2, isAbnormal(metric),
      ));
      datasets.push({
        label: 'Tâm trương',
        data: secondaryPoints,
        borderColor: '#55aeb0',
        backgroundColor: 'rgba(85, 174, 176, .08)',
        pointBackgroundColor: secondaryAbnormal.map((abnormal) => (abnormal ? '#b42318' : '#55aeb0')),
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: secondaryAbnormal.map((abnormal) => (abnormal ? 6 : 4)),
        tension: .32,
        borderWidth: 2,
      });
    }
    return { labels, datasets };
  }, [currentType, period, periodMetrics, selectedType]);

  const chartOptions = useMemo(() => {
    const ranges = [];
    if (currentType?.giaTriMin != null && currentType?.giaTriMax != null) {
      ranges.push({ min: currentType.giaTriMin, max: currentType.giaTriMax, color: 'rgba(22, 163, 74, .09)' });
    }
    if (selectedType === 'HUYET_AP' && currentType?.giaTriMin2 != null && currentType?.giaTriMax2 != null) {
      ranges.push({ min: currentType.giaTriMin2, max: currentType.giaTriMax2, color: 'rgba(38, 114, 140, .06)' });
    }
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: selectedType === 'HUYET_AP',
          position: 'top',
          align: 'end',
          labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.formattedValue} ${currentType?.donVi || ''}`,
          },
        },
        normalRange: { ranges },
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(15, 92, 99, .07)' },
          ticks: { color: '#71858d', font: { size: 10 } },
        },
        x: {
          grid: { display: false },
          ticks: { color: '#71858d', font: { size: 10 }, maxRotation: 0, autoSkip: true },
        },
      },
    };
  }, [currentType, selectedType]);

  const statistics = useMemo(() => {
    if (!periodMetrics.length) return null;
    const primaryValues = periodMetrics.map(primaryValue).filter(Number.isFinite);
    const secondaryValues = periodMetrics.map(secondaryValue).filter(Number.isFinite);
    const pair = (values, operation) => (values.length ? operation(...values) : null);
    const average = (values) => (values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null);
    const compose = (first, second) => second == null
      ? formatValue(first)
      : `${formatValue(first)}/${formatValue(second)}`;
    const normalCount = periodMetrics.filter((metric) => !isAbnormal(metric)).length;
    return {
      highest: compose(pair(primaryValues, Math.max), pair(secondaryValues, Math.max)),
      lowest: compose(pair(primaryValues, Math.min), pair(secondaryValues, Math.min)),
      average: compose(average(primaryValues), average(secondaryValues)),
      normalRate: Math.round((normalCount / periodMetrics.length) * 100),
      total: periodMetrics.length,
    };
  }, [periodMetrics]);

  const refreshMetrics = async () => {
    if (!selectedElder) return;
    setLoading(true);
    try {
      setMetrics(await getHealthMetrics({ nguoiCaoTuoiId: selectedElder }));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectElder = (value) => {
    setLoading(true);
    setMetrics([]);
    setSelectedElder(value);
  };

  const handleAdd = () => {
    form.resetFields();
    const now = metricNow();
    form.setFieldsValue({
      nguoiCaoTuoiId: selectedElder,
      loaiChiSo: selectedType,
      ngayDo: now,
      gioDo: now,
      binhThuong: true,
    });
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
      if (result.alertCreated) message.warning('Chỉ số vượt ngưỡng — hệ thống đã tự động tạo cảnh báo');
      else message.success('Thêm chỉ số sức khỏe thành công');
      setModalOpen(false);
      form.resetFields();
      await refreshMetrics();
    } finally {
      setSaving(false);
    }
  };

  const historyRows = useMemo(
    () => [...periodMetrics].sort((a, b) => metricTime(b).valueOf() - metricTime(a).valueOf()),
    [periodMetrics],
  );

  const historyColumns = [
    {
      title: 'Thời gian', key: 'time', width: 150,
      render: (_, record) => (
        <div className="metric-history-time">
          <strong>{metricTime(record).format('HH:mm')}</strong>
          <span>{metricTime(record).format('DD/MM/YYYY')}</span>
        </div>
      ),
    },
    {
      title: 'Giá trị', key: 'value', width: 150,
      render: (_, record) => <strong className={isAbnormal(record) ? 'metric-value-danger' : 'metric-value-normal'}>{metricDisplayValue(record)}</strong>,
    },
    {
      title: 'Người đo', dataIndex: 'nguoiDoTen', key: 'nguoiDoTen', width: 190,
      render: (value) => value ? <div className="metric-measurer"><TableAvatar name={value} size={30} /><span>{value}</span></div> : <span className="metric-muted">Chưa ghi nhận</span>,
    },
    {
      title: 'Trạng thái', key: 'status', width: 145,
      render: (_, record) => <StatusTag {...getHealthStatusMap(!isAbnormal(record))} size="small" />,
    },
    {
      title: 'Ghi chú', dataIndex: 'ghiChu', key: 'ghiChu', width: 260,
      render: (value) => value || <span className="metric-muted">Không có ghi chú</span>,
    },
  ];

  const primaryRangeLabel = currentType?.giaTriMin != null || currentType?.giaTriMax != null
    ? `${currentType.giaTriMin ?? '—'}–${currentType.giaTriMax ?? '—'}`
    : null;
  const secondaryRangeLabel = currentType?.giaTriMin2 != null || currentType?.giaTriMax2 != null
    ? `${currentType.giaTriMin2 ?? '—'}–${currentType.giaTriMax2 ?? '—'}`
    : null;
  const rangeLabel = primaryRangeLabel
    ? `${primaryRangeLabel}${secondaryRangeLabel ? ` / ${secondaryRangeLabel}` : ''} ${currentType?.donVi || ''}`
    : 'Chưa cấu hình ngưỡng';

  return (
    <div className="health-metrics-page">
      <section className="health-metrics-heading">
        <div>
          <span className="health-metrics-eyebrow"><span /> Theo dõi sức khỏe</span>
          <h1>Chỉ Số Sức Khỏe & Sinh Hiệu Lâm Sàng</h1>
          <p>Theo dõi diễn biến chỉ số và phát hiện các lần đo vượt ngưỡng cấu hình.</p>
        </div>
        {canCreate && <Button type="primary" size="large" icon={<PlusOutlined />} disabled={!selectedElder} onClick={handleAdd}>Nhập chỉ số</Button>}
      </section>

      <section className="health-selected-elder">
        <div className="health-selected-profile">
          <TableAvatar name={selectedProfile?.hoTen || '?'} size={64} />
          <div>
            <small>Hồ sơ đang theo dõi</small>
            <h2>{selectedProfile?.hoTen || 'Chưa có hồ sơ người cao tuổi'}</h2>
            {selectedProfile && <span>{formatEntityCode('NCT', selectedProfile.id)} · {selectedProfile.tuoi ?? '—'} tuổi · {selectedProfile.gioiTinh || 'Chưa cập nhật'} · Nhóm máu {selectedProfile.nhomMau || 'chưa cập nhật'}</span>}
            {selectedProfile && (
              <div className="health-condition-tags">
                {selectedProfile.benhNen?.length
                  ? selectedProfile.benhNen.map((condition) => <Tag key={condition}>{condition}</Tag>)
                  : <em>Chưa cập nhật bệnh nền</em>}
              </div>
            )}
          </div>
        </div>
        <div className="health-elder-picker">
          <label htmlFor="health-elder-select">Đổi người cao tuổi</label>
          <Select
            id="health-elder-select"
            showSearch
            optionFilterProp="label"
            value={selectedElder}
            placeholder="Chọn người cao tuổi"
            suffixIcon={<SwapOutlined />}
            onChange={handleSelectElder}
            options={elders.map((elder) => ({ value: elder.id, label: `${elder.hoTen} · ${formatEntityCode('NCT', elder.id)}` }))}
          />
        </div>
      </section>

      <section className="metric-type-strip">
        {metricTypes.map((type) => {
          const latest = latestByType[type.code];
          const Icon = type.icon;
          return (
            <button
              type="button"
              className={`metric-type-card ${selectedType === type.code ? 'is-selected' : ''}`}
              key={type.id}
              onClick={() => setSelectedType(type.code)}
            >
              <span className="metric-type-icon" style={{ '--metric-color': type.color }}><Icon /></span>
              <div>
                <small>{type.shortLabel}</small>
                <strong>{metricDisplayValue(latest)}</strong>
              </div>
              {latest
                ? <StatusTag status={isAbnormal(latest) ? 'danger' : 'success'} label={isAbnormal(latest) ? 'Vượt ngưỡng' : 'Bình thường'} size="small" />
                : <span className="metric-no-data">Chưa có</span>}
            </button>
          );
        })}
      </section>

      <div className="metric-analysis-grid">
        <section className="metric-chart-card">
          <header>
            <div>
              <h2>Biểu đồ {currentType?.shortLabel || 'chỉ số'} theo thời gian</h2>
              <p>Ngưỡng bình thường: <strong>{rangeLabel}</strong></p>
            </div>
            <div className="metric-period-switch">
              {PERIOD_OPTIONS.map((option) => <Button key={option.value} type={period === option.value ? 'primary' : 'text'} onClick={() => setPeriod(option.value)}>{option.label}</Button>)}
            </div>
          </header>
          <div className="metric-chart-legend"><span className="is-range" /> Dải ngưỡng bình thường <span className="is-normal" /> Trong ngưỡng <span className="is-abnormal" /> Vượt ngưỡng</div>
          <div className="metric-chart-canvas">
            {periodMetrics.length
              ? <Line data={chartData} options={chartOptions} plugins={[normalRangePlugin]} />
              : <div className="metric-chart-empty"><HeartOutlined /><strong>Chưa có dữ liệu trong khoảng đã chọn</strong><span>Hãy chọn khoảng thời gian khác hoặc nhập chỉ số mới.</span></div>}
          </div>
        </section>

        <aside className="metric-statistics-card">
          <header><div><h2>Thống kê</h2><p>{PERIOD_OPTIONS.find((item) => item.value === period)?.label}</p></div><span>{statistics?.total || 0} lần đo</span></header>
          <div className="metric-stat-grid">
            <div className="is-high"><small>Cao nhất</small><strong>{statistics?.highest || '—'}</strong><span>{currentType?.donVi || ''}</span></div>
            <div className="is-low"><small>Thấp nhất</small><strong>{statistics?.lowest || '—'}</strong><span>{currentType?.donVi || ''}</span></div>
            <div className="is-average"><small>Trung bình</small><strong>{statistics?.average || '—'}</strong><span>{currentType?.donVi || ''}</span></div>
          </div>
          <div className="metric-normal-rate">
            <div><span>Tỷ lệ lần đo trong ngưỡng</span><strong>{statistics ? `${statistics.normalRate}%` : '—'}</strong></div>
            <div><i style={{ width: `${statistics?.normalRate || 0}%` }} /></div>
          </div>
        </aside>
      </div>

      <section className="metric-history-card">
        <header>
          <div><h2>Lịch sử đo</h2><p>{currentType?.shortLabel || 'Chỉ số'} · {PERIOD_OPTIONS.find((item) => item.value === period)?.label}</p></div>
          <span>{historyRows.length} bản ghi</span>
        </header>
        <DataTable
          columns={historyColumns}
          dataSource={historyRows}
          rowKey="id"
          loading={loading}
          pageSize={8}
          onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
          rowClassName={(record) => (isAbnormal(record) ? 'row-danger' : '')}
          emptyDescription="Chưa có lịch sử đo phù hợp"
        />
      </section>

      <RecordDetailModal
        open={Boolean(detailRecord)}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết chỉ số — ${detailRecord?.nguoiCaoTuoiTen || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Thời gian đo', key: 'thoiGianDo', render: (_, record) => metricTime(record).format('HH:mm · DD/MM/YYYY') },
          { label: 'Loại chỉ số', key: 'loaiChiSoLabel' },
          { label: 'Giá trị', key: 'giaTri', render: (_, record) => metricDisplayValue(record) },
          { label: 'Người đo', key: 'nguoiDoTen' },
          { label: 'Trạng thái', key: 'laBatThuong', render: (_, record) => <StatusTag {...getHealthStatusMap(!isAbnormal(record))} /> },
          { label: 'Ghi chú', key: 'ghiChu', span: 2 },
        ]}
      />

      <ModalForm
        title="Nhập chỉ số sức khỏe"
        subtitle={`Ghi nhận kết quả đo cho ${selectedProfile?.hoTen || 'người cao tuổi đã chọn'}`}
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
            <Col xs={24} md={12}><Form.Item name="nguoiCaoTuoiId" label="Người cao tuổi" rules={[{ required: true, message: 'Vui lòng chọn người cao tuổi' }]}><Select placeholder="Chọn hồ sơ" showSearch optionFilterProp="label" options={elders.map((elder) => ({ value: elder.id, label: elder.hoTen }))} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="loaiChiSo" label="Loại chỉ số" rules={[{ required: true, message: 'Vui lòng chọn loại chỉ số' }]}><Select placeholder="Chọn loại chỉ số" options={metricTypes.map((type) => ({ value: type.code, label: `${type.tenChiSo} (${type.donVi})` }))} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="ngayDo" label="Ngày đo" rules={[{ required: true, message: 'Vui lòng chọn ngày đo' }]}><DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày đo" style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="gioDo" label="Giờ đo" rules={[{ required: true, message: 'Vui lòng chọn giờ đo' }]}><TimePicker format="HH:mm" placeholder="Chọn giờ đo" style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
        </FormSection>
        <FormSection title="Kết quả đo" description="Hệ thống tự đối chiếu ngưỡng cấu hình và tạo cảnh báo khi phát hiện bất thường">
          <Row gutter={18}>
            <Col xs={24} md={12}><Form.Item name="giaTri" label="Giá trị" rules={[{ required: true, message: 'Vui lòng nhập giá trị đo' }, { pattern: /^\d+(\.\d+)?(\/\d+(\.\d+)?)?$/, message: 'Giá trị không hợp lệ, ví dụ: 72 hoặc 120/80' }]}><Input placeholder="VD: 72 hoặc 120/80" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="binhThuong" label="Đánh giá bổ sung" rules={[{ required: true, message: 'Vui lòng chọn đánh giá' }]}><Select options={[{ value: true, label: 'Để hệ thống tự đánh giá' }, { value: false, label: 'Đánh dấu bất thường thủ công' }]} /></Form.Item></Col>
          </Row>
          <Form.Item name="ghiChu" label="Ghi chú"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Mô tả tình trạng khi đo hoặc lưu ý cần theo dõi" /></Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default HealthMetricsPage;
