import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, ConfigProvider, Dropdown, Result, Spin } from 'antd';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BellOutlined, CalendarOutlined, DownOutlined, HeartFilled, HeartOutlined, HomeOutlined, LockOutlined, LogoutOutlined, MessageOutlined, SafetyOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
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

// This provider only themes the personal workspace, including its portalled UI.
const elderlyTheme = { token: {
  colorPrimary: '#155E4B', colorLink: '#155E4B', colorSuccess: '#197452',
  colorWarning: '#86520C', colorError: '#B4233F', colorInfo: '#1B6786',
  colorText: '#203D35', colorTextSecondary: '#5D7066', colorBorder: '#789487',
  fontFamily: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  fontSize: 16, fontSizeSM: 14, fontSizeLG: 18, controlHeight: 48, borderRadius: 12,
} };

export default function ElderlyPortalPage() {
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation(), navigate = useNavigate();
  const isSosRoute = location.pathname === '/ca-nhan/sos';
  const [accountModal, setAccountModal] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const assistantReturnTo = useRef('/ca-nhan');
  useEffect(() => {
    if (['/ca-nhan', '/ca-nhan/suc-khoe', '/ca-nhan/lich-trinh', '/ca-nhan/sos', '/ca-nhan/canh-bao', '/ca-nhan/ho-so', '/ca-nhan/nguoi-than'].includes(location.pathname)) assistantReturnTo.current = location.pathname + location.search;
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
  const pageLabel = ({ '/ca-nhan/suc-khoe': 'Sức khỏe', '/ca-nhan/tro-ly': 'Trợ lý AI', '/ca-nhan/nguoi-than': 'Người thân' })[location.pathname]
    || navigation.find(item => item.end ? item.to === location.pathname : location.pathname.startsWith(item.to))?.label || 'Không gian cá nhân';
  return <ConfigProvider theme={elderlyTheme} modal={{ className: 'elderly-care-modal' }}><ElderlyLiveContext.Provider value={live}><div ref={rootRef} className={`elderly-web${ready ? ' is-ready' : ''}`}>
    <a className="elderly-skip-link" href="#elderly-web-content">Đến nội dung chính</a>
    <header className="elderly-web-header">
      <NavLink to="/ca-nhan" className="elderly-web-brand" aria-label="CareSenior — Trang chủ của tôi">
        <span aria-hidden="true"><HeartFilled /></span><div><strong>CareSenior</strong><small>Sức khỏe mỗi ngày</small></div>
      </NavLink>
      {ready && <div className={`elderly-web-header-context${isSosRoute ? ' is-emergency' : ''}`} role="group" aria-label="Trang đang mở"><span>Không gian cá nhân</span><strong>{pageLabel}</strong></div>}
      <div className="elderly-web-account">
        {ready && !isSosRoute && <NavLink id="elderly-assistant-entry" className="elderly-web-assistant" to="/ca-nhan/tro-ly"><MessageOutlined aria-hidden="true" /> Hỏi AI</NavLink>}
        <Dropdown trigger={['click']} placement="bottomRight" classNames={{ root: 'elderly-web-account-dropdown' }} autoFocus open={accountOpen} onOpenChange={setAccountOpen} menu={{ items: [
          { key: 'identity', disabled: true, label: <div className="elderly-web-account-identity"><strong>{displayName}</strong><span>Người cao tuổi</span></div> },
          { type: 'divider' },
          { key: 'profile', icon: <UserOutlined />, label: 'Hồ sơ của tôi' },
          ...(ready ? [{ key: 'relatives', icon: <TeamOutlined />, label: 'Người thân của tôi' }] : []),
          { key: 'password', icon: <LockOutlined />, label: 'Đổi mật khẩu' },
          { type: 'divider' }, { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true },
        ], onClick: ({ key }) => {
          setAccountOpen(false);
          if (key === 'logout') logout();
          else if (key === 'relatives') navigate('/ca-nhan/nguoi-than');
          else if (key === 'profile' || isSosRoute) navigate('/ca-nhan/ho-so');
          else setAccountModal('change-password');
        } }}>
          <Button className="elderly-web-account-trigger" aria-label="Menu tài khoản" aria-describedby="elderly-current-account" aria-haspopup="menu" aria-expanded={accountOpen}><Avatar aria-hidden="true">{getNameInitials(displayName || '')}</Avatar>
            <span id="elderly-current-account" className="elderly-web-account-name" title={displayName}><strong>{displayName}</strong><small>Người cao tuổi</small></span><DownOutlined />
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
      <div className="elderly-web-secondary-nav" role="group" aria-label="Lối tắt theo dõi sức khỏe">
        <span className="elderly-web-nav-heading">Truy cập nhanh</span>
        {hasPermission('QLCHISOSK', 'xem') && <NavLink to="/ca-nhan/suc-khoe" className={({ isActive }) => isActive ? 'is-active' : ''}>
          <span aria-hidden="true"><HeartOutlined /></span><span className="elderly-secondary-copy"><strong>Chỉ số sức khỏe</strong><small>Xem và thêm số đo</small></span>
        </NavLink>}
        <NavLink to="/ca-nhan/nguoi-than" className={({ isActive }) => isActive ? 'is-active' : ''}>
          <span aria-hidden="true"><TeamOutlined /></span><span className="elderly-secondary-copy"><strong>Người thân</strong><small>Xem quyền theo dõi</small></span>
        </NavLink>
      </div>
      <div className="elderly-web-nav-note"><HeartFilled aria-hidden="true" /><strong>Chăm sóc từ những điều nhỏ</strong><span>Theo dõi sức khỏe, mỗi ngày một chút.</span></div>
    </nav>}
    <main id="elderly-web-content" className="elderly-web-main" tabIndex={-1}>
      {ready && <div className="elderly-page-meta"><div className="elderly-breadcrumb"><span>Không gian cá nhân</span><span aria-hidden="true">/</span><strong>{pageLabel}</strong></div>
        <div className="elderly-live-status" role="status"><span className={`elderly-live-dot live-${live.connection}`} aria-hidden="true" />
        <span>{({ connected: 'Đã kết nối realtime', connecting: 'Đang kết nối realtime…', disconnected: 'Mất kết nối realtime', offline: 'Thiết bị đang mất mạng', error: 'Chưa kết nối được realtime' })[live.connection]}</span>
        <Button onClick={live.refreshLive}>Đồng bộ lại</Button>
      </div></div>}
      {!hasPermission('QLHOSONCT', 'xem') ? <Result status="403" title="Bạn chưa có quyền xem hồ sơ" subTitle="Vui lòng liên hệ quản trị viên." />
        : state.phase === 'checking' ? <div className="elderly-web-loading" role="status"><Spin /><p>Đang kiểm tra hồ sơ của bạn…</p></div>
          : ['missing', 'saving'].includes(state.phase) ? <ElderlyProfileCompletion user={user} state={state} store={store} canComplete={hasPermission('QLHOSONCT', 'sua')} onLogout={logout} />
            : ready ? <Outlet context={{ profile: state.profile, user, refreshProfile: () => store.check(), safetyApi, sosController, assistantStore, assistantReturnTo: () => assistantReturnTo.current, openPassword: () => setAccountModal('change-password') }} />
              : <Result status={state.phase === 'denied' ? '403' : 'warning'} title="Chưa thể mở hồ sơ" subTitle={state.notice || 'Vui lòng đăng nhập lại hoặc thử tải lại hồ sơ.'}
                extra={[<Button key="retry" type="primary" onClick={() => store.check()}>Thử lại</Button>, <Button key="logout" onClick={logout}>Đăng xuất</Button>]} />}
    </main>
    {!isSosRoute && <AccountMenuModals activeModal={accountModal} onClose={() => setAccountModal(null)} user={user} />}
  </div></ElderlyLiveContext.Provider></ConfigProvider>;
}
