import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Dropdown, Result, Spin } from 'antd';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BellOutlined, CalendarOutlined, DownOutlined, HeartFilled, HomeOutlined, LockOutlined, LogoutOutlined, MessageOutlined, SafetyOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import useElderlyWorkspace from '../../hooks/useElderlyWorkspace';
import useElderlyRealtime from '../../hooks/useElderlyRealtime';
import ElderlyLiveContext from '../../context/ElderlyLiveContext';
import { elderlySafetyApi } from '../../services/elderlySafetyService';
import { createElderlySosController } from '../../utils/elderlySafety';
import { assistantSessionExpiry, createElderlyAssistantStore } from '../../utils/elderlyAssistant';
import { elderlyAssistantApi } from '../../services/elderlyAssistantService';
import AccountMenuModals from '../../components/AccountMenuModals';
import { webSession } from '../../utils/webSession';
import { getNameInitials } from '../../utils/displayUtils';
import ElderlyProfileCompletion from './ElderlyProfileCompletion';
import './ElderlyPortal.css';

const navigation = [
  { to: '/ca-nhan', label: 'Trang chủ', icon: <HomeOutlined />, end: true },
  { to: '/ca-nhan/lich-trinh', label: 'Lịch trình', icon: <CalendarOutlined /> },
  { to: '/ca-nhan/sos', label: 'SOS', icon: <SafetyOutlined />, emergency: true },
  { to: '/ca-nhan/canh-bao', label: 'Cảnh báo', icon: <BellOutlined /> },
  { to: '/ca-nhan/ho-so', label: 'Hồ sơ', icon: <UserOutlined /> },
];

export default function ElderlyPortalPage() {
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation(), navigate = useNavigate();
  const isSosRoute = location.pathname === '/ca-nhan/sos';
  const [accountModal, setAccountModal] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const assistantReturnTo = useRef('/ca-nhan');
  useEffect(() => {
    if (['/ca-nhan', '/ca-nhan/suc-khoe', '/ca-nhan/lich-trinh', '/ca-nhan/sos', '/ca-nhan/canh-bao', '/ca-nhan/ho-so'].includes(location.pathname)) assistantReturnTo.current = location.pathname + location.search;
  }, [location.pathname, location.search]);
  const { state, store } = useElderlyWorkspace(user.userId);
  const ready = state.phase === 'ready' && hasPermission('QLHOSONCT', 'xem');
  const profileId = state.profile?.id;
  const live = useElderlyRealtime({ userId: user.userId, profileId, enabled: ready, canAlerts: hasPermission('QLCANHBAO', 'xem') });
  const refreshLive = live.refreshLive;
  const safetyApi = useMemo(() => elderlySafetyApi({ profileId, userId: user.userId }), [profileId, user.userId]);
  const sosController = useMemo(() => {
    const stamp = webSession.capture();
    return createElderlySosController({ api: safetyApi, current: () => webSession.isCurrent(stamp),
      interactive: () => document.visibilityState !== 'hidden' && document.hasFocus(),
      onRecorded: refreshLive,
    });
  }, [safetyApi, refreshLive]);
  useEffect(() => { sosController.activate(); return () => sosController.dispose(); }, [sosController]);
  const assistantStore = useMemo(() => {
    const stamp = { ...webSession.capture(), ownerId: user.userId };
    return createElderlyAssistantStore({ api: elderlyAssistantApi(profileId), current: () => webSession.isCurrent(stamp), expiresAt: assistantSessionExpiry(stamp.token) });
  }, [profileId, user.userId]);
  useEffect(() => {
    assistantStore.activate();
    // Clear immediately on token/account changes, including other browser tabs.
    const unsubscribe = webSession.subscribe(() => assistantStore.dispose());
    return () => { unsubscribe(); assistantStore.dispose(); };
  }, [assistantStore]);
  const rootRef = useRef(null), navRef = useRef(null);
  useLayoutEffect(() => {
    if (!ready || !navRef.current) return;
    const measure = () => rootRef.current?.style.setProperty('--elderly-nav-height', `${navRef.current?.getBoundingClientRect().height || 90}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navRef.current);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [ready]);
  const displayName = state.profile?.hoTen || user.hoTen || user.tenDangNhap;
  return <ElderlyLiveContext.Provider value={live}><div ref={rootRef} className={`elderly-web${ready ? ' is-ready' : ''}`}>
    <header className="elderly-web-header">
      <NavLink to="/ca-nhan" className="elderly-web-brand" aria-label="CareSenior — Trang chủ của tôi">
        <span aria-hidden="true"><HeartFilled /></span><div><strong>CareSenior</strong><small>Sức khỏe của bạn, mỗi ngày</small></div>
      </NavLink>
      <div className="elderly-web-account">
        {ready && !isSosRoute && <NavLink id="elderly-assistant-entry" className="elderly-web-assistant" to="/ca-nhan/tro-ly"><MessageOutlined /> Hỏi AI</NavLink>}
        <Dropdown trigger={['click']} placement="bottomRight" autoFocus open={accountOpen} onOpenChange={setAccountOpen} menu={{ items: [
          { key: 'profile', icon: <UserOutlined />, label: 'Hồ sơ của tôi' },
          { key: 'password', icon: <LockOutlined />, label: 'Đổi mật khẩu' },
          { type: 'divider' }, { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true },
        ], onClick: ({ key }) => {
          setAccountOpen(false);
          if (key === 'logout') logout();
          else if (key === 'profile' || isSosRoute) navigate('/ca-nhan/ho-so');
          else setAccountModal('change-password');
        } }}>
          <Button className="elderly-web-account-trigger" aria-label="Menu tài khoản" aria-haspopup="menu" aria-expanded={accountOpen}><Avatar aria-hidden="true">{getNameInitials(displayName || '')}</Avatar>
            <span className="elderly-web-account-name" title={displayName}><strong>{displayName}</strong><small>Người cao tuổi</small></span><DownOutlined />
          </Button>
        </Dropdown>
      </div>
    </header>
    {ready && <nav ref={navRef} className="elderly-web-nav" aria-label="Điều hướng Người cao tuổi">
      <span className="elderly-web-nav-heading">Không gian của tôi</span>
      {navigation.map(item => <NavLink key={item.to} to={item.to} end={item.end}
        className={({ isActive }) => `${isActive ? 'is-active ' : ''}${item.emergency ? 'is-sos' : ''}`}>
        <span aria-hidden="true">{item.icon}</span><span>{item.label}</span>
      </NavLink>)}
    </nav>}
    <main id="elderly-web-content" className="elderly-web-main">
      {ready && <div className="elderly-live-status" role="status"><span className={`elderly-live-dot live-${live.connection}`} aria-hidden="true" />
        <span>{({ connected: 'Đã kết nối realtime', connecting: 'Đang kết nối realtime…', disconnected: 'Mất kết nối realtime', offline: 'Thiết bị đang mất mạng', error: 'Chưa kết nối được realtime' })[live.connection]}</span>
        <Button onClick={live.refreshLive}>Đồng bộ lại</Button>
      </div>}
      {!hasPermission('QLHOSONCT', 'xem') ? <Result status="403" title="Bạn chưa có quyền xem hồ sơ" subTitle="Vui lòng liên hệ quản trị viên." />
        : state.phase === 'checking' ? <div className="elderly-web-loading" role="status"><Spin /><p>Đang kiểm tra hồ sơ của bạn…</p></div>
          : ['missing', 'saving'].includes(state.phase) ? <ElderlyProfileCompletion user={user} state={state} store={store} canComplete={hasPermission('QLHOSONCT', 'sua')} onLogout={logout} />
            : ready ? <Outlet context={{ profile: state.profile, user, refreshProfile: () => store.check(), safetyApi, sosController, assistantStore, assistantReturnTo: () => assistantReturnTo.current, openPassword: () => setAccountModal('change-password') }} />
              : <Result status={state.phase === 'denied' ? '403' : 'warning'} title="Chưa thể mở hồ sơ" subTitle={state.notice || 'Vui lòng đăng nhập lại hoặc thử tải lại hồ sơ.'}
                extra={[<Button key="retry" type="primary" onClick={() => store.check()}>Thử lại</Button>, <Button key="logout" onClick={logout}>Đăng xuất</Button>]} />}
    </main>
    {!isSosRoute && <AccountMenuModals activeModal={accountModal} onClose={() => setAccountModal(null)} user={user} />}
  </div></ElderlyLiveContext.Provider>;
}
