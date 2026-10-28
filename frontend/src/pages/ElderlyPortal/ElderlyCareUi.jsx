import React, { useId } from 'react';
import { Alert, Button, Empty, Progress, Spin, Tag } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, HeartOutlined, MedicineBoxOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import { formatAlertTime } from '../../utils/alertTime';
import { doseProgress, instant, metricValue } from '../../utils/elderlyCare';
import { getNameInitials } from '../../utils/displayUtils';

export function PageIntro({ title, description, icon = <HeartOutlined />, eyebrow = 'CARESENIOR · SỨC KHỎE CÁ NHÂN', action, children, className = '' }) {
  return <section className={`elderly-web-welcome elderly-page-intro ${className}`}>
    <div className="elderly-intro-content"><span className="elderly-web-eyebrow"><span aria-hidden="true">{icon}</span>{eyebrow}</span>
      <h1>{title}</h1>{description && <p>{description}</p>}{children}</div>
    {action && <div className="elderly-intro-action">{action}</div>}
  </section>;
}

export function MetricSymbol({ label = '' }) {
  const name = (label || '').toLocaleLowerCase('vi');
  const paths = name.includes('nhiệt') ? <><path d="M10 14.7V5a2 2 0 0 1 4 0v9.7a4 4 0 1 1-4 0Z" /><path d="M12 9v8m5-9h2m-2 4h2" /></>
    : name.includes('huyết') && !name.includes('huyết áp') ? <path d="M12 3S5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-12-7-12Zm-3 13a3 3 0 0 0 3 3" />
      : name.includes('cân') ? <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8 10a4 4 0 0 1 8 0m-4-1 2-2" /></>
        : name.includes('spo') || name.includes('oxy') ? <><path d="M12 3v10m-2-5C8 5 6 6 5 9l-2 7c-1 4 5 5 7 1V8Zm4 0c2-3 4-2 5 1l2 7c1 4-5 5-7 1V8Z" /></>
          : <><path d="M20.8 4.8a5 5 0 0 0-7 0L12 6.6l-1.8-1.8a5 5 0 0 0-7 7L12 21l8.8-9.2a5 5 0 0 0 0-7Z" /><path d="M5 12h4l2-4 2 8 2-4h4" /></>;
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>;
}

export function CareSection({ title, children, action }) {
  return <section className="elderly-web-card elderly-care-section" aria-label={title}>
    <div className="elderly-care-title"><h2>{title}</h2>{action}</div>{children}
  </section>;
}
export const Refresh = ({ onClick, loading }) => <Button icon={<ReloadOutlined />} loading={loading} onClick={onClick}>Tải lại dữ liệu</Button>;
export function ResourceState({ resource, children, empty = 'Chưa có dữ liệu', isEmpty }) {
  if (resource.loading) return <div className="elderly-care-state" role="status"><Spin /><span>Đang tải dữ liệu…</span></div>;
  if (resource.error) return <Alert type="error" showIcon title="Không thể tải dữ liệu" description={resource.error} action={<Button onClick={resource.refresh}>Thử lại</Button>} />;
  if (isEmpty ?? (Array.isArray(resource.data) && resource.data.length === 0)) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />;
  return children;
}
export const MutationNotice = ({ mutation }) => mutation.notice && <Alert role="status" showIcon type={mutation.notice.type} title={mutation.notice.text} />;
export function DoseProgress({ rows, variant }) {
  const { done, total } = doseProgress(rows);
  if (variant === 'spotlight') return <div className="elderly-home-dose-progress">
    <Progress type="circle" size={104} percent={total ? Math.round(done / total * 100) : 0} strokeColor="#b3e9cf" trailColor="#ffffff26"
      format={() => <span className="elderly-home-progress-numbers">{done}<small>/ {total}</small></span>} />
    <strong>Đã uống {done}/{total} liều</strong><span>Tính theo từng liều trong hôm nay.</span>
  </div>;
  return <div className="elderly-care-progress"><div className="elderly-progress-heading"><span className="elderly-ui-icon" aria-hidden="true"><MedicineBoxOutlined /></span><div><small>Tiến độ uống thuốc</small><strong>Đã uống {done}/{total} liều</strong></div></div><Progress percent={total ? Math.round(done / total * 100) : 0} strokeColor="#21966F" /><span>Tính theo từng liều trong ngày được chọn.</span></div>;
}
export function MetricCard({ row, title, unit, compact = false }) {
  return <article className={`elderly-care-metric${compact ? ' is-compact' : ''}`}><div className="elderly-metric-heading"><span>{title || row?.tenChiSo}</span><span className="elderly-metric-symbol"><MetricSymbol label={title || row?.tenChiSo} /></span></div>
    <div className="elderly-care-value"><strong>{metricValue(row)}</strong><span>{unit || row?.donVi}</span></div>
    {row && <><Tag icon={row.laBatThuong ? undefined : <CheckCircleOutlined aria-hidden="true" />} color={row.laBatThuong ? 'orange' : 'green'}>{row.laBatThuong ? 'Ngoài ngưỡng theo dõi' : 'Trong ngưỡng theo dõi'}</Tag>
      <time><ClockCircleOutlined aria-hidden="true" /> {formatAlertTime(row.thoiGianDo)}</time></>}
  </article>;
}

// Render actual measurement instants on the x axis, not equally spaced dates.
// Assessment/color remain server-provided. The history is the text alternative.
export function MetricTrend({ rows, unit }) {
  const id = useId();
  const points = rows.filter(row => Number.isFinite(instant(row.thoiGianDo)) && Number.isFinite(Number(row.giaTri)))
    .slice().sort((a, b) => instant(a.thoiGianDo) - instant(b.thoiGianDo));
  if (!points.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu để vẽ biểu đồ" />;
  const values = points.flatMap(row => row.giaTriPhu == null ? [+row.giaTri] : [+row.giaTri, +row.giaTriPhu]);
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const first = instant(points[0].thoiGianDo), span = instant(points.at(-1).thoiGianDo) - first || 1;
  const x = row => points.length === 1 ? 300 : 45 + (instant(row.thoiGianDo) - first) / span * 510;
  const y = value => 160 - (value - min) / range * 120;
  const secondary = points.filter(row => row.giaTriPhu != null);
  return <div className="elderly-care-chart">
    <svg viewBox="0 0 600 210" role="img" aria-labelledby={id}>
      <title id={id}>Xu hướng {points.length} số đo, đơn vị {unit}. Chi tiết ở lịch sử bên dưới.</title>
      {[40, 100, 160].map(v => <line key={v} x1="45" x2="555" y1={v} y2={v} stroke="#deebe3" />)}
      <text x="4" y="40">{max}</text><text x="4" y="165">{min}</text>
      <polyline points={points.map(row => `${x(row)},${y(row.giaTri)}`).join(' ')} fill="none" stroke="#21966F" strokeWidth="3" />
      {secondary.length > 0 && <polyline points={secondary.map(row => `${x(row)},${y(row.giaTriPhu)}`).join(' ')} fill="none" stroke="#7357b5" strokeWidth="3" strokeDasharray="6 3" />}
      {points.map(row => <circle key={row.id} cx={x(row)} cy={y(row.giaTri)} r="4" fill="#155e4b"><title>{formatAlertTime(row.thoiGianDo)}: {metricValue(row)} {unit}</title></circle>)}
    </svg>
    <div className="elderly-care-chart-dates"><span>{formatAlertTime(points[0].thoiGianDo)}</span><span>{formatAlertTime(points.at(-1).thoiGianDo)}</span></div>
    <p className="elderly-chart-legend">Đường xanh: {secondary.length ? 'giá trị tâm thu · Đường tím nét đứt: tâm trương' : 'giá trị đo'}. Đơn vị: {unit || 'Theo danh mục'}.</p>
    <dl className="elderly-care-stats">{[['Thấp nhất', Math.min(...points.map(row => +row.giaTri))], ['Trung bình', points.reduce((sum, row) => sum + Number(row.giaTri), 0) / points.length], ['Cao nhất', Math.max(...points.map(row => +row.giaTri))]].map(([label, value]) => <div key={label}><dt>{label}{secondary.length ? ' (tâm thu)' : ''}</dt><dd>{Number(value.toFixed(2))} <small>{unit}</small></dd></div>)}</dl>
  </div>;
}

export function Caregivers({ resource }) {
  return <CareSection title="Người chăm sóc của tôi" action={<Refresh onClick={resource.refresh} loading={resource.loading} />}>
    <ResourceState resource={resource} empty="Chưa có người chăm sóc được liên kết">
      <div className="elderly-care-list elderly-caregiver-list">{resource.data?.map(row => <article className="elderly-care-row elderly-caregiver-row" key={row.id}>
        <span className="elderly-caregiver-avatar" aria-hidden="true">{getNameInitials(row.hoTen || '') || <UserOutlined />}</span>
        <div><strong>{row.hoTen}</strong><span>{row.laChinh ? 'Người chăm sóc chính' : 'Người chăm sóc'}{row.moiQuanHe ? ` · ${row.moiQuanHe}` : ''}</span></div>
        {row.soDienThoai && <a href={`tel:${row.soDienThoai}`}>{row.soDienThoai}</a>}
      </article>)}</div>
    </ResourceState>
  </CareSection>;
}
