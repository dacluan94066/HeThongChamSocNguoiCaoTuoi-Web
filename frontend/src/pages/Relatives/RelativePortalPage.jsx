import { metricAssessment } from '../../utils/metricAssessment';
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Avatar, Button, Empty, Select, Skeleton, Space, Spin, Table, Tabs, Tag } from 'antd';
import { LockOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import useRelativePortal from '../../hooks/useRelativePortal';
import useRelativeSos from '../../hooks/useRelativeSos';
import RelativeSosPanel from '../../components/RelativeSosPanel';
import AccountMenuModals from '../../components/AccountMenuModals';
import RelativePortalHeader from './RelativePortalHeader';
import StatusTag, { getAlertLevelStatus, getAlertStatusMap, getAppointmentStatusMap, getElderStatusMap, getMedStatusMap } from '../../components/StatusTag';
import { PORTAL_FEATURES, formatPortalTime, metricGroups, sevenDayTrend, relativeLocalDate } from '../../utils/relativePortalData';
import { getNameInitials } from '../../utils/displayUtils';
import './RelativePortal.css';

const SECTIONS = { profile: 'Tổng quan', health: 'Chỉ số sức khỏe', medications: 'Lịch thuốc', appointments: 'Lịch khám', alerts: 'Cảnh báo & SOS' };
const MetricValue = ({ row }) => <><strong>{row.giaTri ?? 'Chưa có dữ liệu'}{row.giaTriPhu != null ? `/${row.giaTriPhu}` : ''}</strong><span>{row.donVi}</span></>;
const MetricStatus = ({ row }) => { const status = metricAssessment(row); return <Tag color={status.color}>{status.label}</Tag>; };
const ScopeField = ({ allowed, value }) => <span>{allowed ? value || 'Chưa có dữ liệu' : 'Chưa được đồng ý chia sẻ'}</span>;
const ProfileCard = ({ profile }) => <section className="relative-portal-card" aria-label="Hồ sơ cơ bản được chia sẻ">
  <h2>Hồ sơ cơ bản</h2><dl className="relative-portal-profile-grid">
    <div><dt>Họ tên</dt><dd>{profile.hoTen || 'Chưa có dữ liệu'}</dd></div>
    <div><dt>Mối quan hệ</dt><dd>{profile.moiQuanHe || 'Chưa có dữ liệu'}</dd></div>
    <div><dt>Tuổi</dt><dd>{profile.tuoi ?? 'Chưa có dữ liệu'}</dd></div>
    <div><dt>Giới tính</dt><dd>{profile.gioiTinh || 'Chưa có dữ liệu'}</dd></div>
    <div><dt>Nhóm máu</dt><dd>{profile.nhomMau || 'Chưa có dữ liệu'}</dd></div>
    <div><dt>Theo dõi</dt><dd><StatusTag {...getElderStatusMap(profile.trangThai)} /></dd></div>
    <div><dt>Bệnh nền</dt><dd><ScopeField allowed={profile.xemBenhNen} value={profile.benhNen} /></dd></div>
    <div><dt>Dị ứng</dt><dd><ScopeField allowed={profile.xemDiUng} value={profile.diUng} /></dd></div>
  </dl><p className="relative-portal-muted"><LockOutlined /> Thông tin chỉ hiển thị theo phạm vi đã được đồng ý chia sẻ.</p>
</section>;
const SectionContent = ({ section, label, state, store, children }) => {
  const data = state.sections[section];
  if (data.status === 'error') return <Alert showIcon type="error" title={`Chưa tải được ${label.toLowerCase()}`} description={data.error}
    action={<Button onClick={() => store.loadSection(section)}>Thử lại</Button>} />;
  if (data.status === 'idle' || data.status === 'loading' && !data.rows.length) return <div role="status" className="relative-portal-loading"><Spin /> Đang tải {label.toLowerCase()}...</div>;
  return <><Spin spinning={data.status === 'loading'}>{data.rows.length ? children(data.rows) : <Empty description={`Chưa có dữ liệu ${label.toLowerCase()}`} />}</Spin>
    <div className="relative-portal-list-footer"><span>Đã tải {data.rows.length} bản ghi</span>
      {data.more && <Button loading={data.status === 'loading'} onClick={() => store.loadSection(section, true)}>Tải thêm {label.toLowerCase()}</Button>}</div></>;
};
const HealthSummary = ({ rows }) => <div className="relative-portal-metric-grid">{metricGroups(rows).map(group => {
  const row = group.values[0];
  return <article className="relative-portal-metric" key={group.id}><h3>{row.tenChiSo || 'Chỉ số sức khỏe'}</h3>
    <div className="relative-portal-metric-value"><MetricValue row={row} /></div>
    <MetricStatus row={row} /><p>{formatPortalTime(row.thoiGianDo)}</p></article>;
})}</div>;
const HealthTrend = ({ rows }) => {
  const [chosen, setChosen] = useState('');
  const groups = metricGroups(rows), group = groups.find(item => item.id === chosen) || groups[0];
  const points = sevenDayTrend(group?.values || []);
  const range = points.flatMap(row => [row.giaTri, ...(row.giaTriPhu == null ? [] : [row.giaTriPhu])]);
  const min = range.length ? Math.min(...range) : 0, max = range.length ? Math.max(...range) : 1;
  const first = relativeLocalDate(points[0]?.thoiGianDo)?.getTime() || 0;
  const duration = (relativeLocalDate(points.at(-1)?.thoiGianDo)?.getTime() || 0) - first;
  const line = field => points.filter(row => row[field] != null).map(row => `${30 + (relativeLocalDate(row.thoiGianDo).getTime() - first) / (duration || 1) * 580},${160 - (row[field] - min) / (max - min || 1) * 120}`).join(' ');
  return <section className="relative-portal-card"><div className="relative-portal-section-heading"><h2>Xu hướng 7 ngày</h2>
    <Select aria-label="Chỉ số trên biểu đồ" value={group?.id} onChange={setChosen} options={groups.map(item => ({ value: item.id, label: item.values[0].tenChiSo }))} /></div>
    {points.length >= 2 ? <><svg viewBox="0 0 640 190" role="img" aria-label={`Biểu đồ ${group.values[0].tenChiSo} từ các lần đo đã tải trong 7 ngày`}>
      <title>Xu hướng số đo đã tải trong 7 ngày</title>{[40, 100, 160].map(y => <line key={y} x1="30" x2="610" y1={y} y2={y} stroke="#dfebe9" />)}
      <polyline fill="none" stroke="#167763" strokeWidth="3" points={line('giaTri')} />
      {points.some(row => row.giaTriPhu != null) && <polyline fill="none" stroke="#ba7015" strokeWidth="3" points={line('giaTriPhu')} />}
    </svg><div className="relative-portal-trend-labels"><span>{formatPortalTime(points[0].thoiGianDo)}</span><span>{formatPortalTime(points.at(-1).thoiGianDo)}</span></div>
      <p className="relative-portal-muted">Đơn vị: {group.values[0].donVi || 'Chưa có dữ liệu'} · Đường xanh: giá trị chính{points.some(row => row.giaTriPhu != null) ? ' · Đường cam: giá trị phụ' : ''}</p></>
      : <Empty description="Cần ít nhất hai lần đo đã tải trong 7 ngày để hiển thị xu hướng" />}
    <p className="relative-portal-muted">Số đo và đánh giá được ghi nhận từ hệ thống, không thay thế ý kiến nhân viên y tế.</p>
  </section>;
};
const HealthHistory = ({ rows }) => <section className="relative-portal-card"><h2>Lịch sử đo đã tải</h2><Table dataSource={rows} rowKey="id" pagination={false} size="middle" scroll={{ x: 620 }} columns={[
  { title: 'Thời điểm đo', dataIndex: 'thoiGianDo', render: formatPortalTime, width: 185 },
  { title: 'Chỉ số', dataIndex: 'tenChiSo' }, { title: 'Số đo', key: 'value', render: (_, row) => <span className="relative-portal-inline-value"><MetricValue row={row} /></span> },
  { title: 'Đánh giá từ hệ thống', dataIndex: 'laBatThuong', render: (_, row) => <MetricStatus row={row} /> },
]} /></section>;
const Medications = ({ rows }) => <div className="relative-portal-records">{rows.map(row => <article key={row.id} className="relative-portal-card">
  <div className="relative-portal-section-heading"><h3>{row.tenThuoc || 'Chưa có tên thuốc'}</h3><StatusTag {...getMedStatusMap(row.trangThai, row.thoiGianDuKien)} /></div>
  <dl><div><dt>Dự kiến uống</dt><dd>{formatPortalTime(row.thoiGianDuKien)}</dd></div><div><dt>Liều dùng</dt><dd>{row.lieuDung || 'Chưa có dữ liệu'}{row.donViTinh ? ` · ${row.donViTinh}` : ''}</dd></div>
    {row.cachDung && <div><dt>Hướng dẫn</dt><dd>{row.cachDung}</dd></div>}{row.thoiGianThucTe && <div><dt>Ghi nhận thực tế</dt><dd>{formatPortalTime(row.thoiGianThucTe)}</dd></div>}</dl>
</article>)}</div>;
const Appointments = ({ rows, profile }) => <div className="relative-portal-records">{rows.map(row => <article key={row.id} className="relative-portal-card">
  <div className="relative-portal-section-heading"><h3>{row.tenBenhVien || 'Lịch khám'}</h3><StatusTag {...getAppointmentStatusMap(row.trangThai)} /></div>
  <dl><div><dt>Thời gian</dt><dd>{formatPortalTime(row.thoiGianKham)}</dd></div><div><dt>Chuyên khoa</dt><dd>{row.chuyenKhoa || 'Chưa có dữ liệu'}</dd></div>
    {row.bacSiPhuTrach && <div><dt>Bác sĩ phụ trách</dt><dd>{row.bacSiPhuTrach}</dd></div>}
    <div><dt>Kết quả khám</dt><dd><ScopeField allowed={profile.xemKetQuaKham} value={row.ketQuaKham} /></dd></div></dl>
</article>)}</div>;
const sosStatus = value => ({ DangGui: { status: 'danger', label: 'Chưa tiếp nhận' }, DaTiepNhan: { status: 'warning', label: 'Đã tiếp nhận' }, DaXuLy: { status: 'success', label: 'Đã xử lý' } }[value]
  || { status: 'default', label: 'Chưa rõ trạng thái' });
const Alerts = ({ rows, sos = false }) => <div className="relative-portal-records">{rows.map(row => <article key={row.id} className={`relative-portal-card ${sos ? 'relative-portal-sos-card' : ''}`}>
  <div className="relative-portal-section-heading"><h3>{sos ? 'SOS đã ghi nhận' : 'Cảnh báo'}</h3><Space wrap>
    {!sos && <StatusTag {...getAlertLevelStatus(row.mucDo)} />}<StatusTag {...(sos ? sosStatus(row.trangThai) : getAlertStatusMap(row.trangThai))} /></Space></div>
  <p>{row.noiDung || 'Chưa có nội dung được chia sẻ'}</p><p className="relative-portal-muted">{formatPortalTime(sos ? row.ngayGui : row.ngayTao)}</p>
  {sos && row.ngayXuLy && <p>Thời gian xử lý: {formatPortalTime(row.ngayXuLy)}</p>}
</article>)}</div>;

export default function RelativePortalPage() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedId = params.get('nct') || null;
  const { state, store } = useRelativePortal(requestedId);
  const sos = useRelativeSos(id => {
    const current = store.getSnapshot();
    if (current.profile?.id === id && current.phase === 'ready') {
      void store.loadSection('sos'); void store.loadSection('alerts');
    }
  });
  const [tab, setTab] = useState('profile'), [accountModal, setAccountModal] = useState(null);
  const allowedTabs = Object.keys(SECTIONS).filter(key => key === 'profile' || hasPermission(PORTAL_FEATURES[key], 'xem'));
  const activeTab = allowedTabs.includes(tab) ? tab : 'profile';
  const matching = !requestedId || Number(requestedId) === state.selectedId;
  const profile = matching ? state.profile : null;
  useEffect(() => {
    if (!profile) return;
    const needed = activeTab === 'profile' ? ['health'] : activeTab === 'alerts' ? ['alerts', 'sos'] : [activeTab];
    for (const section of needed) if (hasPermission(PORTAL_FEATURES[section], 'xem') && state.sections[section].status === 'idle') void store.loadSection(section);
  }, [profile, activeTab, hasPermission, state.sections, store]);
  const choose = id => { store.clear('loading'); const next = new URLSearchParams(); next.set('nct', String(id)); setParams(next); };
  const leave = () => { sos.manager.clear(); store.clear('expired'); logout(); };
  const read = (section, children) => <SectionContent section={section} label={section === 'sos' ? 'SOS' : SECTIONS[section]} state={state} store={store}>{children}</SectionContent>;
  return <div className="relative-portal">
    <RelativePortalHeader user={user} onHome={() => { store.clear('loading'); setParams({}); }}
      onChangePassword={() => setAccountModal('change-password')} onLogout={leave} />
    <main className="relative-portal-main"><RelativeSosPanel sos={sos} /><section className="relative-portal-hero"><div><span className="relative-portal-eyebrow">Gia đình · Đồng hành chăm sóc</span><h1>Người thân của tôi</h1>
      <p>Theo dõi thông tin được chia sẻ của người cao tuổi trong gia đình.</p></div><Button icon={<ReloadOutlined />} loading={state.phase === 'loading'} onClick={() => store.reload(requestedId)}>Tải lại dữ liệu</Button></section>
      {state.phase === 'loading' || state.phase === 'idle' ? <div role="status"><p>Đang kiểm tra quyền và tải danh sách người thân...</p><Skeleton active paragraph={{ rows: 5 }} /></div>
        : state.phase !== 'ready' ? <Alert showIcon type={['unavailable', 'suspended', 'offline'].includes(state.phase) ? 'info' : 'warning'}
          title={state.phase === 'suspended' ? 'Dữ liệu tạm đóng khi chuyển khỏi ứng dụng' : 'Chưa thể hiển thị dữ liệu người thân'} description={state.notice}
          action={<Button onClick={() => state.phase === 'expired' ? navigate('/login') : store.reload(requestedId)}>{state.phase === 'expired' ? 'Đăng nhập lại' : 'Thử lại'}</Button>} />
          : !state.list.length ? <section className="relative-portal-card"><Empty description="Bạn chưa có người cao tuổi được liên kết" /><p className="relative-portal-empty-help">Vui lòng liên hệ Quản trị viên để xác minh sự đồng ý chia sẻ và cấp liên kết theo dõi.</p></section>
            : <div className="relative-portal-workspace"><aside className="relative-portal-people" aria-label="Người cao tuổi được phép theo dõi"><h2>Gia đình của bạn</h2>
              <Select aria-label="Chọn người cao tuổi đang xem" value={state.selectedId || undefined} placeholder="Chọn NCT được liên kết" onChange={choose}
                options={state.list.map(person => ({ value: person.id, label: `${person.hoTen} · ${person.moiQuanHe}` }))} />
              <div className="relative-portal-person-list">{state.list.map(person => <button key={person.id} type="button" aria-pressed={state.selectedId === person.id}
                className={state.selectedId === person.id ? 'is-selected' : ''} onClick={() => choose(person.id)}><Avatar size={42}>{getNameInitials(person.hoTen)}</Avatar>
                <span><strong>{person.hoTen || 'Chưa có dữ liệu'}</strong><small>{person.moiQuanHe || 'Chưa có quan hệ'}{person.tuoi != null ? ` · ${person.tuoi} tuổi` : ''}</small></span></button>)}</div>
              {state.listMore && <Button block loading={state.listLoading} onClick={store.loadMoreList}>Tải thêm người thân</Button>}
              <p className="relative-portal-muted"><LockOutlined /> Chỉ những hồ sơ có liên kết hợp lệ mới được hiển thị.</p></aside>
              <section className="relative-portal-details" aria-label="Thông tin NCT đang được xem">
                {state.notice && <Alert type="warning" showIcon title={state.notice} />}
                {state.profileLoading || !matching && state.selectedId != null ? <div role="status"><p>Đang kiểm tra quyền của hồ sơ được chọn...</p><Skeleton active /></div>
                  : !profile ? <Empty description="Chọn NCT trong danh sách được cấp quyền để xem thông tin" /> : <>
                    <div className="relative-portal-selected"><span>Đang xem hồ sơ</span><h2>{profile.hoTen}</h2><p>{profile.moiQuanHe} · Dữ liệu chỉ xem</p></div>
                    <Tabs activeKey={activeTab} onChange={setTab} items={allowedTabs.map(key => ({ key, label: SECTIONS[key] }))} />
                    <div className="relative-portal-tab" role="region" aria-label={`${SECTIONS[activeTab]} của ${profile.hoTen}`}>
                      {activeTab === 'profile' && <><ProfileCard profile={profile} />{hasPermission('QLCHISOSK', 'xem') && <section className="relative-portal-card"><h2>Chỉ số gần nhất đã tải</h2>
                        <p className="relative-portal-muted">Theo những lần đo đã tải. Mở Chỉ số sức khỏe để xem lịch sử và tải thêm.</p>{read('health', rows => <HealthSummary rows={rows} />)}</section>}</>}
                      {activeTab === 'health' && read('health', rows => <><section className="relative-portal-card"><h2>Số đo gần nhất trong dữ liệu đã tải</h2><HealthSummary rows={rows} /></section><HealthTrend rows={rows} /><HealthHistory rows={rows} /></>)}
                      {activeTab === 'medications' && read('medications', rows => <Medications rows={rows} />)}
                      {activeTab === 'appointments' && read('appointments', rows => <Appointments rows={rows} profile={profile} />)}
                      {activeTab === 'alerts' && <><Alert showIcon type="info" title="Theo dõi cảnh báo ở chế độ chỉ xem" description="Bạn có thể xem trạng thái đã được hệ thống ghi nhận. Nhấn Tải lại dữ liệu để kiểm tra thông tin mới." />
                        <section><h2>Cảnh báo</h2>{read('alerts', rows => <Alerts rows={rows} />)}</section><section><h2>SOS đã ghi nhận</h2>{read('sos', rows => <Alerts rows={rows} sos />)}</section></>}
                    </div></>}
              </section></div>}
    </main><footer className="relative-portal-footer">CareSenior · Đồng hành cùng gia đình, tôn trọng quyền riêng tư</footer>
    <AccountMenuModals activeModal={accountModal} onClose={() => setAccountModal(null)} user={user} />
  </div>;
}
