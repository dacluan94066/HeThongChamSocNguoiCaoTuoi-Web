import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Badge, Button, Empty, Modal, Pagination, Skeleton, Tabs, Tooltip } from 'antd';
import { AlertOutlined, ArrowLeftOutlined, ArrowRightOutlined, BellOutlined, CalendarOutlined,
  CheckOutlined, CheckCircleOutlined, ClockCircleOutlined, HeartOutlined, MedicineBoxOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../services/axiosClient';
import { getSocket } from '../services/socketClient';
import { webSession } from '../utils/webSession';
import { formatAlertTime, parseAlertTime } from '../utils/alertTime';
import { createNotificationApi, createNotificationStore, staffNotificationRoute, subscribeNotificationEvents } from '../utils/notificationCenter';
import './NotificationCenter.css';

const PAGE_SIZE = 8;
const containTabFocus = event => {
  if (event.key !== 'Tab') return;
  const controls = [...event.currentTarget.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
    .filter(node => node.tabIndex >= 0 && !node.disabled && node.getAttribute('aria-disabled') !== 'true'
      && node.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
  const first = controls[0], last = controls.at(-1);
  // Prevent the last Tab from moving focus into browser chrome before the library's focusin lock can react.
  if (first && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
    event.preventDefault(); (event.shiftKey ? last : first).focus();
  }
};
const noticeKind = item => {
  if (item.loaiThongBao === 'KhanCap' || item.lienKetBang === 'CanhBaoKhanCap') return { label: 'SOS', tone: 'urgent', icon: <AlertOutlined /> };
  if (item.loaiThongBao === 'NhacThuoc' || item.lienKetBang.startsWith('LichUongThuoc')) return { label: 'Lịch thuốc', tone: 'medicine', icon: <MedicineBoxOutlined /> };
  if (item.loaiThongBao === 'NhacLichKham' || item.lienKetBang.startsWith('LichKhamBenh')) return { label: 'Lịch khám', tone: 'visit', icon: <CalendarOutlined /> };
  if (item.loaiThongBao === 'CanhBaoChiSo') return { label: 'Sức khỏe', tone: 'health', icon: <HeartOutlined /> };
  return { label: 'Thông báo', tone: 'general', icon: <BellOutlined /> };
};

function NotificationSession({ user, hasPermission }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false), [filter, setFilter] = useState('all'), [page, setPage] = useState(1), [selectedId, setSelectedId] = useState(null);
  const firstControl = useRef(null);
  const trigger = useRef(null);
  const { store, current } = useMemo(() => {
    const stamp = webSession.capture();
    const current = () => webSession.isCurrent(stamp);
    return { current, store: createNotificationStore({ userId: user.userId, current, api: createNotificationApi(client, user.userId, stamp) }) };
  }, [user.userId]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.activate();
    const unsubscribe = webSession.subscribe(() => store.clear());
    const unbind = subscribeNotificationEvents({ socket: getSocket(), store, userId: user.userId, current, browser: window, document });
    return () => { unsubscribe(); unbind(); store.dispose(); };
  }, [store, current, user.userId]);
  const unread = state.items.filter(item => !item.daDoc).length;
  const filtered = state.items.filter(item => filter === 'all' || (filter === 'read' ? item.daDoc : !item.daDoc));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = state.items.find(item => item.id === selectedId);
  const close = () => { setOpen(false); setSelectedId(null); };
  const show = () => { trigger.current?.focus(); setOpen(true); void store.refresh(); };
  const showNotice = item => { setSelectedId(item.id); if (!item.daDoc) void store.read(item.id); };
  const target = selected && staffNotificationRoute(selected, user.tenVaiTro, hasPermission);
  const counts = { all: state.items.length, unread, read: state.items.length - unread };

  return <>
    <Tooltip title={state.loaded ? `${unread} thông báo chưa đọc` : 'Trung tâm thông báo'}>
      <Badge count={state.loaded ? unread : 0} size="small" overflowCount={99}>
        <Button ref={trigger} type="text" className="header-notification-button" icon={<BellOutlined />}
          aria-label={state.loaded ? `Trung tâm thông báo, ${unread} chưa đọc` : 'Mở Trung tâm thông báo'}
          aria-haspopup="dialog" aria-expanded={open} onClick={show} />
      </Badge>
    </Tooltip>
    <Modal open={open && current()} onCancel={close} centered width={860} footer={null} keyboard
      mask={{ closable: true }} destroyOnHidden focusable={{ trap: true, focusTriggerAfterClose: true }}
      modalRender={node => <div onKeyDown={containTabFocus}>{node}</div>}
      className="notification-center-modal" classNames={{ wrapper: 'notification-center-wrap' }}
      closable={{ 'aria-label': 'Đóng Trung tâm thông báo' }}
      afterOpenChange={visible => { if (visible) firstControl.current?.focus(); }}
      title={<div className="notification-center-heading"><span className="notification-center-emblem" aria-hidden="true"><BellOutlined /></span>
        <div><h2>Trung tâm thông báo</h2><p>Cập nhật dành riêng cho tài khoản của bạn</p></div></div>}>
      <div className="notification-center-toolbar">
        <span role="status" aria-live="polite" aria-atomic="true" className="notification-center-summary">
          <span className="notification-center-count">{state.loaded ? unread : '—'}</span> thông báo chưa đọc
        </span>
        <Button ref={firstControl} icon={<ReloadOutlined />} loading={state.loading} onClick={() => { void store.refresh(); }}>Tải lại</Button>
      </div>
      {!selected && <Tabs activeKey={filter} onChange={key => { setFilter(key); setPage(1); }}
        className="notification-center-tabs" items={[['all', 'Tất cả'], ['unread', 'Chưa đọc'], ['read', 'Đã đọc']]
          .map(([key, label]) => ({ key, label: <span>{label} <b>{counts[key]}</b></span> }))} />}
      <div className="notification-center-scroll" aria-busy={state.loading}>
        {state.error && <Alert type="error" showIcon title={state.error} action={<Button onClick={() => { void store.refresh(); }} disabled={state.loading}>Thử lại</Button>} />}
        {state.readError && <Alert type="error" showIcon title={state.readError} />}
        {state.loading && !state.loaded ? <div className="notification-center-loading" aria-label="Đang tải thông báo"><Skeleton active paragraph={{ rows: 6 }} /></div>
          : selected ? <section className="notification-center-detail">
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setSelectedId(null)}>Danh sách thông báo</Button>
            <NoticeContent item={selected} detail />
            <div className="notification-center-detail-actions">
              {!selected.daDoc && <Button icon={<CheckOutlined />} loading={state.reading.includes(selected.id)} onClick={() => { void store.read(selected.id); }}>Đánh dấu đã đọc</Button>}
              {target && <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => { close(); navigate(target); }}>Mở chức năng liên quan</Button>}
            </div>
          </section>
            : !state.error && rows.length === 0 ? <div className="notification-center-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={filter === 'unread' ? 'Bạn đã đọc hết thông báo' : filter === 'read' ? 'Chưa có thông báo đã đọc' : 'Chưa có thông báo nào'} />
              <p>Thông báo mới sẽ xuất hiện tại đây khi có cập nhật.</p></div>
              : <ul className="notification-center-list" aria-label="Danh sách thông báo">
                {rows.map(item => <li key={item.id} data-notification-id={item.id} className={`notification-center-item${item.daDoc ? '' : ' is-unread'}`}>
                  <NoticeContent item={item} onOpen={() => showNotice(item)} />
                  {!item.daDoc && <Button className="notification-center-read" size="small" icon={<CheckOutlined />}
                    loading={state.reading.includes(item.id)} onClick={() => { void store.read(item.id); }}>Đánh dấu đã đọc</Button>}
                </li>)}
              </ul>}
      </div>
      <div className="notification-center-footer">
        <span>{selected ? 'Chỉ đánh dấu đọc thông báo, không xử lý cảnh báo SOS.' : `${filtered.length} thông báo${filter === 'unread' ? ' chưa đọc' : filter === 'read' ? ' đã đọc' : ''}`}</span>
        {!selected && filtered.length > PAGE_SIZE && <Pagination current={currentPage} pageSize={PAGE_SIZE} total={filtered.length}
          showSizeChanger={false} simple onChange={value => { setPage(value); document.querySelector('.notification-center-scroll')?.scrollTo(0, 0); }} />}
      </div>
    </Modal>
  </>;
}

function NoticeContent({ item, onOpen, detail = false }) {
  const kind = noticeKind(item);
  return <div className={`notification-center-content${detail ? ' is-detail' : ''}`}>
    <span className={`notification-center-kind is-${kind.tone}`} aria-hidden="true">{kind.icon}</span>
    <div className="notification-center-copy">
      <div className="notification-center-meta"><span>{kind.label}</span><span className={item.daDoc ? 'is-read' : 'is-new'}>
        {item.daDoc ? <CheckCircleOutlined aria-hidden="true" /> : <i aria-hidden="true" />}{item.daDoc ? 'Đã đọc' : 'Chưa đọc'}</span></div>
      {onOpen ? <button type="button" className="notification-center-title" onClick={onOpen}>{item.tieuDe}</button> : <h3>{item.tieuDe}</h3>}
      <p className="notification-center-text">{item.noiDung || 'Thông báo không có nội dung bổ sung.'}</p>
      <time dateTime={parseDateTime(item.ngayTao)}><ClockCircleOutlined aria-hidden="true" />{formatAlertTime(item.ngayTao)} <span>· Giờ Việt Nam</span></time>
    </div>
  </div>;
}

const parseDateTime = value => parseAlertTime(value)?.toISOString();

export default function NotificationCenter() {
  const { user, hasPermission, authLoading, permissionsLoading } = useAuth();
  if (!user || authLoading || permissionsLoading || !['QuanTriVien', 'NguoiChamSoc'].includes(user.tenVaiTro)
    || !hasPermission('QLCANHBAO', 'xem')) return null;
  return <NotificationSession key={`${user.userId}:${user.tenVaiTro}`} user={user} hasPermission={hasPermission} />;
}
