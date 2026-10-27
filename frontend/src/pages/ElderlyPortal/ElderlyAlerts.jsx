import React, { useCallback, useState } from 'react';
import { Alert, Button, Modal, Select, Tabs, Tag } from 'antd';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useElderlyMutation, useElderlyResource } from '../../hooks/useElderlyResource';
import { formatAlertTime } from '../../utils/alertTime';
import { isRead, isSos, levelLabel, notificationRoute, statusLabel } from '../../utils/elderlySafety';
import { MutationNotice, Refresh, ResourceState } from './ElderlyCareUi';

export function ElderlyAlertsPage() {
  const { hasPermission } = useAuth(), [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'notifications' ? 'notifications' : 'alerts';
  return <><div className="elderly-web-welcome"><h1>Cảnh báo và thông báo</h1><p>Thông tin dành cho chính tài khoản của bạn.</p></div>
    {!hasPermission('QLCANHBAO', 'xem') ? <Alert type="warning" title="Tài khoản chưa có quyền xem cảnh báo và thông báo." /> : <section className="elderly-web-card">
      <Tabs activeKey={tab} destroyOnHidden onChange={key => setParams({ tab: key })} items={[
        { key: 'alerts', label: 'Cảnh báo', children: <OwnAlerts /> },
        { key: 'notifications', label: 'Thông báo', children: <OwnNotifications /> },
      ]} />
    </section>}
  </>;
}
function OwnAlerts() {
  const { profile, safetyApi } = useOutletContext();
  const alerts = useElderlyResource(useCallback(signal => safetyApi.alerts(signal), [safetyApi]), `alerts:${profile.id}`);
  const [kind, setKind] = useState('all'), [detailId, setDetailId] = useState(null);
  const rows = alerts.data?.filter(row => kind === 'all' || (kind === 'sos' ? isSos(row) : !isSos(row))) || [];
  const key = row => String(row.id ?? `${row.nguonBang}:${row.nguonId}`);
  const detail = rows.find(row => key(row) === detailId);
  return <>
    <div className="elderly-care-title"><h2>Cảnh báo của tôi</h2><Refresh onClick={alerts.refresh} loading={alerts.loading} /></div>
    <div className="elderly-care-filters"><label>Loại cảnh báo<Select aria-label="Loại cảnh báo" value={kind} onChange={setKind} options={[{ value: 'all', label: 'Tất cả cảnh báo' }, { value: 'health', label: 'Sức khỏe và nhắc lịch' }, { value: 'sos', label: 'SOS khẩn cấp' }]} /></label></div>
    <ResourceState resource={alerts} isEmpty={!rows.length} empty="Chưa có cảnh báo phù hợp"><div className="elderly-care-list">{rows.map(row => <article className={`elderly-care-row ${isSos(row) ? 'elderly-sos-history' : ''}`} key={key(row)}>
      <div className="elderly-care-title"><h3>{isSos(row) ? 'SOS khẩn cấp' : ({ ChiSoBatThuong: 'Chỉ số sức khỏe', NhacUongThuoc: 'Nhắc uống thuốc', NhacLichKham: 'Nhắc lịch khám' })[row.loaiCanhBao] || 'Cảnh báo'}</h3><Tag color={isSos(row) || ['KhanCap', 'Cao'].includes(row.mucDo) ? 'red' : 'orange'}>{levelLabel(row.mucDo)}</Tag></div>
      <time>{formatAlertTime(row.ngayTao)}</time><p>{row.noiDung}</p><Tag>{statusLabel(row.trangThai)}</Tag><Button onClick={() => setDetailId(key(row))}>Xem chi tiết cảnh báo</Button>
    </article>)}</div></ResourceState>
    <Modal className="elderly-care-modal" title="Chi tiết cảnh báo của tôi" open={Boolean(detail)} onCancel={() => setDetailId(null)} footer={<Button onClick={() => setDetailId(null)}>Đóng</Button>}>
      {detail && <dl className="elderly-care-details">{[['Loại', isSos(detail) ? 'SOS khẩn cấp' : 'Cảnh báo sức khỏe / nhắc lịch'], ['Mức độ', levelLabel(detail.mucDo)], ['Thời gian', formatAlertTime(detail.ngayTao)], ['Trạng thái', statusLabel(detail.trangThai)], ['Nội dung', detail.noiDung]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Chưa có dữ liệu'}</dd></div>)}</dl>}
    </Modal>
  </>;
}
function OwnNotifications() {
  const { profile, user, safetyApi } = useOutletContext();
  const notices = useElderlyResource(useCallback(signal => safetyApi.notifications(signal), [safetyApi]), `notifications:${user.userId}:${profile.id}`);
  const mutation = useElderlyMutation(), [filter, setFilter] = useState('all');
  const rows = notices.data?.filter(row => filter === 'all' || isRead(row.daDoc) === (filter === 'read')) || [];
  return <>
    <div className="elderly-care-title"><h2>Thông báo tài khoản</h2><Refresh onClick={notices.refresh} loading={notices.loading} /></div>
    <MutationNotice mutation={mutation} />
    <div className="elderly-care-filters"><label>Trạng thái đọc<Select aria-label="Trạng thái đọc thông báo" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Tất cả thông báo' }, { value: 'unread', label: 'Chưa đọc' }, { value: 'read', label: 'Đã đọc' }]} /></label></div>
    <ResourceState resource={notices} isEmpty={!rows.length} empty="Chưa có thông báo phù hợp">
      <p>{notices.data?.filter(row => !isRead(row.daDoc)).length} thông báo chưa đọc trong danh sách đã tải.</p>
      <div className="elderly-care-list">{rows.map(row => <article key={row.id} className="elderly-care-row">
        <div className="elderly-care-title"><h3>{row.tieuDe || 'Thông báo'}</h3><Tag color={isRead(row.daDoc) ? 'default' : 'green'}>{isRead(row.daDoc) ? 'Đã đọc' : 'Chưa đọc'}</Tag></div>
        <time>{formatAlertTime(row.ngayTao)}</time><p>{row.noiDung}</p><div className="elderly-care-actions">
          {!isRead(row.daDoc) && <Button disabled={mutation.busy} onClick={() => mutation.run(signal => safetyApi.markRead(row.id, signal), () => notices.refresh())}>Đánh dấu đã đọc</Button>}
          {notificationRoute(row) && <Link to={notificationRoute(row)}>Mở mục liên quan</Link>}
        </div>
      </article>)}</div>
    </ResourceState>
  </>;
}
