import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Empty, Select, Skeleton, Tag } from 'antd';
import {
  AlertOutlined, BarChartOutlined, CheckCircleOutlined, HeartOutlined,
  MedicineBoxOutlined, TeamOutlined, WarningOutlined,
} from '@ant-design/icons';
import { Bar, Line } from 'react-chartjs-2';
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale,
  LineElement, PointElement, Title, Tooltip,
} from 'chart.js';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import TableAvatar from '../../components/TableAvatar';
import { getHealthReport } from '../../services/reportService';
import { calculateAge, formatEntityCode } from '../../utils/displayUtils';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  Title, Tooltip, Legend, Filler,
);

const { RangePicker } = DatePicker;

const COLORS = {
  teal: '#0F5C63',
  tealLight: 'rgba(15,92,99,.15)',
  green: '#16A34A',
  red: '#B42318',
  orange: '#D97706',
  blue: '#2563EB',
};

const QUICK_RANGES = [
  { key: 'today', label: 'Hôm nay', value: () => [dayjs(), dayjs()] },
  { key: '7days', label: '7 ngày', value: () => [dayjs().subtract(6, 'day'), dayjs()] },
  { key: '30days', label: '30 ngày', value: () => [dayjs().subtract(29, 'day'), dayjs()] },
  { key: 'month', label: 'Tháng này', value: () => [dayjs().startOf('month'), dayjs()] },
];

const AGE_OPTIONS = [
  { value: 'all', label: 'Mọi độ tuổi' },
  { value: 'under60', label: 'Dưới 60 tuổi' },
  { value: '60to69', label: '60–69 tuổi' },
  { value: '70to79', label: '70–79 tuổi' },
  { value: '80plus', label: 'Từ 80 tuổi' },
];
const GENDER_OPTIONS = [
  { value: 'all', label: 'Mọi giới tính' },
  { value: 'Nam', label: 'Nam' },
  { value: 'Nữ', label: 'Nữ' },
  { value: 'Khác', label: 'Khác' },
];
const CARE_STATUS_OPTIONS = [
  { value: 'all', label: 'Mọi tình trạng' },
  { value: 'DangTheoDoi', label: 'Đang theo dõi' },
  { value: 'CanChamSocDacBiet', label: 'Cần chăm sóc đặc biệt' },
  { value: 'NgungTheoDoi', label: 'Ngừng theo dõi' },
];

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        usePointStyle: true,
        boxWidth: 8,
        padding: 18,
        filter: (item, data) => !data.datasets[item.datasetIndex]?.isThreshold,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#64748B' } },
    y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.16)' }, ticks: { color: '#64748B' } },
  },
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = dayjs(value);
  return date.isValid() ? date.format('DD/MM/YYYY HH:mm') : '—';
};

const ReportKpi = ({ className = '', icon, label, value, suffix, note }) => (
  <article className={`report-kpi-card ${className}`}>
    <span className="report-kpi-icon">{icon}</span>
    <div>
      <small>{label}</small>
      <strong>{value}<em>{suffix}</em></strong>
      <p>{note}</p>
    </div>
  </article>
);

const ReportsPage = () => {
  const [range, setRange] = useState(() => QUICK_RANGES[2].value());
  const [quickRange, setQuickRange] = useState('30days');
  const [selectedElder, setSelectedElder] = useState('all');
  const [ageGroup, setAgeGroup] = useState('all');
  const [gender, setGender] = useState('all');
  const [careStatus, setCareStatus] = useState('all');
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const fromDate = range?.[0]?.format('YYYY-MM-DD');
  const toDate = range?.[1]?.format('YYYY-MM-DD');

  useEffect(() => {
    let active = true;
    getHealthReport({
      from: fromDate,
      to: toDate,
      nguoiCaoTuoiId: selectedElder === 'all' ? null : selectedElder,
      nhomTuoi: ageGroup === 'all' ? null : ageGroup,
      gioiTinh: gender === 'all' ? null : gender,
      trangThai: careStatus === 'all' ? null : careStatus,
    })
      .then((data) => { if (active) setReport(data); })
      .catch(() => {
        if (active) {
          setReport(null);
          setError('Không thể tải dữ liệu báo cáo. Vui lòng kiểm tra kết nối và thử lại.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fromDate, toDate, selectedElder, ageGroup, gender, careStatus, reloadKey]);

  const metricTypes = report?.xuHuongChiSo || [];
  const currentMetric = metricTypes.find((item) => item.id === selectedMetric)
    || metricTypes.find((item) => item.duLieu?.length)
    || metricTypes[0];

  const medicationChart = useMemo(() => {
    const rows = report?.tuanThuTheoTuan || [];
    return {
      labels: rows.map((item) => `Tuần ${dayjs(item.tuanBatDau).format('DD/MM')}`),
      datasets: [{
        label: 'Tỷ lệ tuân thủ',
        data: rows.map((item) => item.tyLe),
        backgroundColor: rows.map((item) => (
          item.tyLe >= 80 ? COLORS.teal : item.tyLe >= 60 ? COLORS.orange : COLORS.red
        )),
        borderRadius: 8,
        maxBarThickness: 52,
      }],
    };
  }, [report]);

  const alertChart = useMemo(() => {
    const rows = report?.canhBaoTheoThang || [];
    const keys = [...new Set(rows.map((item) => `${item.nam}-${String(item.thang).padStart(2, '0')}`))];
    const levels = [
      { key: 'Thap', label: 'Thấp', color: '#60A5FA' },
      { key: 'TrungBinh', label: 'Trung bình', color: '#FBBF24' },
      { key: 'Cao', label: 'Cao', color: '#F97316' },
      { key: 'KhanCap', label: 'Khẩn cấp', color: '#DC2626' },
    ];
    return {
      labels: keys.map((key) => {
        const [year, month] = key.split('-');
        return `T${Number(month)}/${year}`;
      }),
      datasets: levels.map((level) => ({
        label: level.label,
        backgroundColor: level.color,
        borderRadius: 4,
        data: keys.map((key) => rows
          .filter((item) => `${item.nam}-${String(item.thang).padStart(2, '0')}` === key && item.mucDo === level.key)
          .reduce((sum, item) => sum + item.soLuong, 0)),
      })),
    };
  }, [report]);

  const metricChart = useMemo(() => {
    const points = currentMetric?.duLieu || [];
    const labels = points.map((point) => dayjs(point.thoiGian).format('DD/MM HH:mm'));
    const abnormalColors = points.map((point) => (point.laBatThuong ? COLORS.red : COLORS.teal));
    const datasets = [{
      label: currentMetric?.ten || 'Chỉ số',
      data: points.map((point) => point.giaTri),
      borderColor: COLORS.teal,
      backgroundColor: COLORS.tealLight,
      pointBackgroundColor: abnormalColors,
      pointBorderColor: abnormalColors,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.3,
      borderWidth: 2.5,
    }];

    if (points.some((point) => point.giaTriPhu != null)) {
      datasets.push({
        label: `${currentMetric?.ten || 'Chỉ số'} phụ`,
        data: points.map((point) => point.giaTriPhu),
        borderColor: COLORS.blue,
        backgroundColor: 'rgba(37,99,235,.08)',
        pointBackgroundColor: abnormalColors,
        pointBorderColor: abnormalColors,
        pointRadius: 4,
        tension: 0.3,
        borderWidth: 2,
      });
    }

    const appendRange = (min, max, color, background) => {
      if (min == null || max == null || !labels.length) return;
      datasets.push({
        label: 'Ngưỡng dưới', data: labels.map(() => min), borderColor: color,
        borderDash: [5, 5], pointRadius: 0, borderWidth: 1, isThreshold: true,
      });
      datasets.push({
        label: 'Dải ngưỡng', data: labels.map(() => max), borderColor: color,
        backgroundColor: background, borderDash: [5, 5], pointRadius: 0,
        borderWidth: 1, fill: '-1', isThreshold: true,
      });
    };
    appendRange(currentMetric?.giaTriMin, currentMetric?.giaTriMax, 'rgba(22,163,74,1)', 'rgba(22,163,74,.08)');
    appendRange(currentMetric?.giaTriMin2, currentMetric?.giaTriMax2, 'rgba(37,99,235,1)', 'rgba(37,99,235,.06)');

    return { labels, datasets };
  }, [currentMetric]);

  const kpi = report?.kpi || {};
  const profileStats = report?.thongKeHoSo;
  const careStats = report?.thongKeChamSoc;
  const caregiverStats = report?.thongKeNguoiChamSoc;
  const profileBreakdowns = profileStats ? [
    { title: 'Theo độ tuổi', items: [
      ['Dưới 60 tuổi', profileStats.theoDoTuoi?.duoi60],
      ['60–69 tuổi', profileStats.theoDoTuoi?.tu60Den69],
      ['70–79 tuổi', profileStats.theoDoTuoi?.tu70Den79],
      ['Từ 80 tuổi', profileStats.theoDoTuoi?.tu80TroLen],
    ] },
    { title: 'Theo giới tính', items: [
      ['Nam', profileStats.theoGioiTinh?.Nam],
      ['Nữ', profileStats.theoGioiTinh?.Nu],
      ['Khác', profileStats.theoGioiTinh?.Khac],
    ] },
    { title: 'Theo tình trạng chăm sóc', items: [
      ['Đang theo dõi', profileStats.theoTrangThai?.DangTheoDoi],
      ['Cần chăm sóc đặc biệt', profileStats.theoTrangThai?.CanChamSocDacBiet],
      ['Ngừng theo dõi', profileStats.theoTrangThai?.NgungTheoDoi],
    ] },
  ] : [];
  const careNoteChart = {
    labels: (careStats?.theoNgay || []).map((item) => dayjs(item.ngay).format('DD/MM')),
    datasets: [{
      label: 'Nhật ký chăm sóc',
      data: (careStats?.theoNgay || []).map((item) => item.soNhatKy),
      backgroundColor: COLORS.teal,
      borderRadius: 6,
      maxBarThickness: 36,
    }],
  };
  const caregiverColumns = [
    {
      title: 'Người chăm sóc', key: 'caregiver', width: 260,
      render: (_, record) => (
        <div className="table-person-cell">
          <TableAvatar name={record.hoTen} size={38} />
          <div className="table-person-copy">
            <div className="table-person-name">{record.hoTen}</div>
            <div className="table-person-meta">{formatEntityCode('NCS', record.id)}</div>
          </div>
        </div>
      ),
    },
    { title: 'NCT đang phụ trách', dataIndex: 'soNguoiPhuTrach', key: 'assigned', align: 'center', width: 160 },
    { title: 'Nhật ký trong kỳ', dataIndex: 'soNhatKy', key: 'notes', align: 'center', width: 150 },
    {
      title: 'Tài khoản', dataIndex: 'coTaiKhoan', key: 'account', width: 150,
      render: (value) => <Tag color={value ? 'green' : 'default'}>● {value ? 'Có tài khoản' : 'Chưa có tài khoản'}</Tag>,
    },
    {
      title: 'Trạng thái', dataIndex: 'trangThai', key: 'status', width: 160,
      render: (value) => <Tag color={value === 'DangLamViec' ? 'green' : value === 'TamNghi' ? 'orange' : 'default'}>
        ● {({ DangLamViec: 'Đang làm việc', TamNghi: 'Tạm nghỉ', NgungLamViec: 'Ngừng làm việc' })[value] || 'Chưa xác định'}
      </Tag>,
    },
  ];
  const summaryColumns = [
    {
      title: 'Người cao tuổi',
      key: 'elderly',
      width: 240,
      render: (_, record) => (
        <div className="table-person-cell">
          <TableAvatar name={record.hoTen} size={42} />
          <div className="table-person-copy">
            <div className="table-person-name">{record.hoTen}</div>
            <div className="table-person-meta">
              {formatEntityCode('NCT', record.id)} · {calculateAge(record.ngaySinh) ?? '—'} tuổi · {record.gioiTinh || '—'}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Đã uống đúng', dataIndex: 'daUong', key: 'daUong', align: 'center', width: 130,
      render: (value) => <strong className="report-count-success">{value}</strong>,
    },
    {
      title: 'Bỏ lỡ / Từ chối', dataIndex: 'boLoTuChoi', key: 'boLoTuChoi', align: 'center', width: 150,
      render: (value) => <strong className={value ? 'report-count-danger' : ''}>{value}</strong>,
    },
    {
      title: 'Cảnh báo', dataIndex: 'soCanhBao', key: 'soCanhBao', align: 'center', width: 115,
      render: (value) => <Tag color={value ? 'orange' : 'default'}>{value}</Tag>,
    },
    {
      title: 'Chỉ số bất thường gần nhất',
      dataIndex: 'chiSoBatThuongGanNhat',
      key: 'latestAbnormal',
      width: 300,
      render: (metric) => metric ? (
        <div className="report-abnormal-cell">
          <strong>{metric.ten}: {metric.giaTri}{metric.giaTriPhu != null ? `/${metric.giaTriPhu}` : ''} {metric.donVi}</strong>
          <span>{formatDateTime(metric.thoiGian)}</span>
        </div>
      ) : <span className="text-muted">Không ghi nhận trong kỳ</span>,
    },
  ];

  const chooseQuickRange = (item) => {
    setLoading(true);
    setError('');
    setQuickRange(item.key);
    setRange(item.value());
  };

  const changeProfileFilter = (setter, value) => {
    setLoading(true);
    setError('');
    setSelectedElder('all');
    setter(value);
  };

  return (
    <div className="health-report-page">
      <PageHeader
        title="Báo cáo & Thống kê sức khỏe"
        subtitle="Tổng hợp dữ liệu chăm sóc, cảnh báo và chỉ số sức khỏe từ hệ thống"
        icon={<BarChartOutlined />}
      />

      <section className="report-filter-panel">
        <div className="report-quick-ranges">
          {QUICK_RANGES.map((item) => (
            <Button
              key={item.key}
              type={quickRange === item.key ? 'primary' : 'text'}
              onClick={() => chooseQuickRange(item)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <RangePicker
          value={range}
          format="DD/MM/YYYY"
          allowClear={false}
          onChange={(value) => {
            if (value?.[0] && value?.[1]) {
              setLoading(true);
              setError('');
              setQuickRange('');
              setRange(value);
            }
          }}
        />
        <Select
          className="report-subject-select"
          value={selectedElder}
          onChange={(value) => {
            setLoading(true);
            setError('');
            setSelectedElder(value);
          }}
          showSearch
          optionFilterProp="label"
          placeholder="Tất cả người cao tuổi"
          options={[
            { value: 'all', label: 'Tất cả người cao tuổi' },
            ...(report?.doiTuong || []).map((item) => ({
              value: item.id,
              label: `${item.hoTen} · ${formatEntityCode('NCT', item.id)}`,
            })),
          ]}
        />
        <Select
          className="report-demographic-select"
          aria-label="Lọc theo độ tuổi"
          value={ageGroup}
          onChange={(value) => changeProfileFilter(setAgeGroup, value)}
          options={AGE_OPTIONS}
        />
        <Select
          className="report-demographic-select"
          aria-label="Lọc theo giới tính"
          value={gender}
          onChange={(value) => changeProfileFilter(setGender, value)}
          options={GENDER_OPTIONS}
        />
        <Select
          className="report-demographic-select"
          aria-label="Lọc theo tình trạng chăm sóc"
          value={careStatus}
          onChange={(value) => changeProfileFilter(setCareStatus, value)}
          options={CARE_STATUS_OPTIONS}
        />
      </section>

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button size="small" onClick={() => {
            setLoading(true);
            setError('');
            setReloadKey((value) => value + 1);
          }}>Thử lại</Button>}
        />
      )}

      {loading && !report ? (
        <Skeleton active paragraph={{ rows: 12 }} />
      ) : report ? (
        <>
          <section className={`report-kpi-grid ${loading ? 'is-loading' : ''}`}>
            <ReportKpi
              className="is-success"
              icon={<MedicineBoxOutlined />}
              label="Tỷ lệ tuân thủ uống thuốc"
              value={kpi.tyLeTuanThu ?? 0}
              suffix="%"
              note={`${kpi.daUong ?? 0}/${kpi.tongLieu ?? 0} liều đã uống`}
            />
            <ReportKpi
              className="is-warning"
              icon={<AlertOutlined />}
              label="Tổng cảnh báo trong kỳ"
              value={kpi.tongCanhBao ?? 0}
              note={`${kpi.tyLeCanhBaoDaXuLy ?? 0}% đã xử lý`}
            />
            <ReportKpi
              className="is-danger"
              icon={<WarningOutlined />}
              label="Cảnh báo SOS"
              value={kpi.soSOS ?? 0}
              note="tín hiệu khẩn cấp từ Mobile"
            />
            <ReportKpi
              className="is-info"
              icon={<HeartOutlined />}
              label="Chỉ số bất thường"
              value={kpi.chiSoBatThuong ?? 0}
              note="lần đo vượt ngưỡng trong kỳ"
            />
          </section>

          <article className="report-panel" style={{ marginBottom: 20 }}>
            <h3>Thời điểm uống và ghi nhận</h3>
            <p>So sánh thời gian uống đang lưu với giờ dự kiến. Ghi nhận bổ sung dùng giờ thực tế người dùng nhập; xác nhận thông thường dùng thời điểm bấm xác nhận như trước.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Tag color="green">Không sau giờ dự kiến: {report.ghiNhanUongThuoc?.khongSauGioDuKien ?? 0}</Tag>
              <Tag color="orange">Sau giờ dự kiến: {report.ghiNhanUongThuoc?.sauGioDuKien ?? 0}</Tag>
              <Tag>Chưa rõ giờ uống: {report.ghiNhanUongThuoc?.chuaRoGioUong ?? 0}</Tag>
              <Tag color="blue">Ghi nhận bổ sung: {report.ghiNhanUongThuoc?.ghiNhanBoSung ?? 0}</Tag>
            </div>
            <p>Ghi nhận bổ sung có thể thuộc bất kỳ nhóm thời điểm uống nào ở trên; không cộng thêm vào tổng liều. Đây không phải đánh giá y khoa về uống đúng giờ.</p>
          </article>

          <section className="report-chart-grid">
            <article className="report-panel">
              <div className="report-panel-heading">
                <div><h3>Tuân thủ uống thuốc theo tuần</h3><p>Tỷ lệ số liều đã uống trên tổng lịch trong từng tuần</p></div>
                <CheckCircleOutlined />
              </div>
              {(report?.tuanThuTheoTuan || []).length ? (
                <div className="report-chart"><Bar data={medicationChart} options={{
                  ...chartOptions,
                  plugins: { ...chartOptions.plugins, tooltip: { callbacks: { label: (context) => `${context.raw}%` } } },
                  scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: 100, ticks: { callback: (value) => `${value}%` } } },
                }} /></div>
              ) : <Empty description="Không có lịch uống thuốc trong kỳ" />}
            </article>

            <article className="report-panel">
              <div className="report-panel-heading">
                <div><h3>Cảnh báo theo tháng</h3><p>Phân bổ số cảnh báo theo mức độ</p></div>
                <AlertOutlined />
              </div>
              {(report?.canhBaoTheoThang || []).length ? (
                <div className="report-chart"><Bar data={alertChart} options={{
                  ...chartOptions,
                  scales: {
                    x: { ...chartOptions.scales.x, stacked: true },
                    y: { ...chartOptions.scales.y, stacked: true, ticks: { precision: 0 } },
                  },
                }} /></div>
              ) : <Empty description="Không có cảnh báo trong kỳ" />}
            </article>
          </section>

          <section className="report-panel report-health-trend">
            <div className="report-panel-heading is-wrap">
              <div>
                <h3>Xu hướng chỉ số sức khỏe</h3>
                <p>Điểm màu đỏ là lần đo vượt ngưỡng; vùng màu nhạt thể hiện khoảng bình thường.</p>
              </div>
              <div className="report-metric-tabs">
                {metricTypes.map((metric) => (
                  <Button
                    key={metric.id}
                    type={currentMetric?.id === metric.id ? 'primary' : 'default'}
                    onClick={() => setSelectedMetric(metric.id)}
                  >
                    {metric.ten}
                  </Button>
                ))}
              </div>
            </div>
            {currentMetric?.duLieu?.length ? (
              <>
                <div className="report-threshold-copy">
                  Ngưỡng chính: {currentMetric.giaTriMin ?? '—'}–{currentMetric.giaTriMax ?? '—'} {currentMetric.donVi}
                  {currentMetric.giaTriMin2 != null && ` · Ngưỡng phụ: ${currentMetric.giaTriMin2}–${currentMetric.giaTriMax2} ${currentMetric.donVi}`}
                </div>
                <div className="report-chart is-wide"><Line data={metricChart} options={chartOptions} /></div>
              </>
            ) : <Empty description={`Không có dữ liệu ${currentMetric?.ten?.toLowerCase() || 'chỉ số'} trong kỳ`} />}
          </section>

          <section className="report-panel report-summary-panel">
            <div className="report-panel-heading">
              <div>
                <h3>Tổng hợp theo từng người cao tuổi</h3>
                <p>Số liệu được tính trong đúng khoảng ngày và đối tượng đã chọn.</p>
              </div>
              <span className="report-result-count">{report?.tongHopNguoiCaoTuoi?.length || 0} hồ sơ</span>
            </div>
            <DataTable
              columns={summaryColumns}
              dataSource={report?.tongHopNguoiCaoTuoi || []}
              rowKey="id"
              pageSize={10}
              emptyDescription="Không có hồ sơ phù hợp"
            />
          </section>

          <section className="report-panel report-business-panel">
            <div className="report-panel-heading">
              <div>
                <h3>Thống kê hồ sơ người cao tuổi</h3>
                <p>Phân bố theo tuổi tại ngày cuối kỳ báo cáo, giới tính và trạng thái hồ sơ hiện tại.</p>
              </div>
              <Tag color="cyan">{profileStats?.tongHoSo || 0} hồ sơ</Tag>
            </div>
            <div className="report-breakdown-filters">
              <Select
                aria-label="Lọc thống kê theo độ tuổi"
                value={ageGroup}
                onChange={(value) => changeProfileFilter(setAgeGroup, value)}
                options={AGE_OPTIONS}
              />
              <Select
                aria-label="Lọc thống kê theo giới tính"
                value={gender}
                onChange={(value) => changeProfileFilter(setGender, value)}
                options={GENDER_OPTIONS}
              />
              <Select
                aria-label="Lọc thống kê theo tình trạng chăm sóc"
                value={careStatus}
                onChange={(value) => changeProfileFilter(setCareStatus, value)}
                options={CARE_STATUS_OPTIONS}
              />
              <span>Áp dụng cho toàn bộ báo cáo; người chăm sóc chỉ thấy NCT được phân công.</span>
            </div>
            <div className="report-breakdown-grid">
              {profileBreakdowns.map((group) => (
                <div className="report-breakdown-card" key={group.title}>
                  <h4>{group.title}</h4>
                  {group.items.map(([label, value]) => (
                    <div className="report-breakdown-row" key={label}>
                      <span>{label}</span><strong>{value ?? 0}</strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="report-panel report-business-panel">
            <div className="report-panel-heading">
              <div>
                <h3>Lịch sử chăm sóc trong kỳ</h3>
                <p>Đếm nhật ký chăm sóc đã ghi, không bao gồm nhật ký đã hủy.</p>
              </div>
              <div className="report-heading-stats">
                <Tag color="cyan">{careStats?.tongNhatKy || 0} nhật ký</Tag>
                <Tag>{careStats?.soNgayCoChamSoc || 0} ngày có ghi nhận</Tag>
              </div>
            </div>
            {careStats?.theoNgay?.length ? (
              <div className="report-chart is-wide"><Bar data={careNoteChart} options={{
                ...chartOptions,
                scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, ticks: { precision: 0 } } },
              }} /></div>
            ) : <Empty description="Không có nhật ký chăm sóc trong kỳ" />}
          </section>

          <section className="report-panel report-summary-panel report-business-panel">
            <div className="report-panel-heading">
              <div>
                <h3>Thống kê người chăm sóc</h3>
                <p>Số NCT đang phụ trách và nhật ký đã ghi trong khoảng ngày đã chọn.</p>
              </div>
              <div className="report-heading-stats">
                <Tag icon={<TeamOutlined />}>{caregiverStats?.tongNguoiChamSoc || 0} người</Tag>
                <Tag color="green">{caregiverStats?.daCoTaiKhoan || 0} có tài khoản</Tag>
                <Tag color="orange">{caregiverStats?.chuaPhuTrach || 0} chưa phụ trách NCT</Tag>
              </div>
            </div>
            <DataTable
              columns={caregiverColumns}
              dataSource={caregiverStats?.danhSach || []}
              rowKey="id"
              pageSize={10}
              emptyDescription="Không có người chăm sóc phù hợp"
            />
          </section>
        </>
      ) : null}
    </div>
  );
};

export default ReportsPage;
