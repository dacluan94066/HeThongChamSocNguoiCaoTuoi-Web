import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar, Badge, Button, Dropdown, Input, Layout, Menu, Space,
} from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertOutlined,
  BarChartOutlined,
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  HeartFilled,
  HeartOutlined,
  HistoryOutlined,
  LockOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  PhoneOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import usePermission from '../hooks/usePermission';
import { getAlerts } from '../services/alertService';
import AccountMenuModals from '../components/AccountMenuModals';
import useRealtimeAlerts from '../hooks/useRealtimeAlerts';
import SosAudioControls from '../components/SosAudioControls';
import { getNameInitials } from '../utils/displayUtils';
import NotificationCenter from '../components/NotificationCenter';

const { Sider, Header, Content } = Layout;
const { Search } = Input;

const SIDEBAR_WIDTH = 264;
const SIDEBAR_COLLAPSED_WIDTH = 76;
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1100;

const ROLE_LABELS = {
  QuanTriVien: 'Quản trị viên',
};

const MAIN_NAVIGATION = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Tổng quan' },
  { key: '/ho-so-nguoi-cao-tuoi', icon: <HeartOutlined />, label: 'Hồ sơ NCT', permission: 'QLHOSONCT' },
  { key: '/nguoi-cham-soc', icon: <TeamOutlined />, label: 'Người chăm sóc', permission: 'QLNGUOICHAMSOC' },
  { key: '/chi-so-suc-khoe', icon: <HeartFilled />, label: 'Chỉ số sức khỏe', permission: 'QLCHISOSK' },
  { key: '/canh-bao', icon: <AlertOutlined />, label: 'Cảnh báo', permission: 'QLCANHBAO', alertItem: true },
  { key: '/lich-uong-thuoc', icon: <ClockCircleOutlined />, label: 'Lịch uống thuốc', permission: 'QLLICHUONGTHUOC' },
  { key: '/danh-muc-thuoc', icon: <MedicineBoxOutlined />, label: 'Thuốc của NCT', permission: 'QLTHUOC' },
  { key: '/lich-kham-benh', icon: <CalendarOutlined />, label: 'Lịch khám bệnh', permission: 'QLLICHKHAM' },
  { key: '/nhat-ky-cham-soc', icon: <BookOutlined />, label: 'Nhật ký chăm sóc', permission: 'QLNHATKY' },
  { key: '/lien-he-khan-cap', icon: <PhoneOutlined />, label: 'Liên hệ khẩn cấp', permission: 'QLLIENHEKC' },
  { key: '/bao-cao', icon: <BarChartOutlined />, label: 'Báo cáo', permission: 'QLBAOCAO' },
];

const SYSTEM_NAVIGATION = [
  { key: '/nguoi-dung', icon: <UserOutlined />, label: 'Người dùng & Phân quyền', permission: 'QLNGUOIDUNG' },
  { key: '/nguoi-than', icon: <TeamOutlined />, label: 'Quản lý Người thân', permission: 'QLNGUOIDUNG', adminOnly: true },
];

const SidebarLogo = ({ collapsed, onClick }) => (
  <button type="button" className="sidebar-logo" onClick={onClick} aria-label="Về trang tổng quan">
    <span className="sidebar-logo-icon"><HeartFilled /></span>
    {!collapsed && (
      <span className="sidebar-logo-text">
        <span className="sidebar-logo-title">CareSenior</span>
        <span className="sidebar-logo-subtitle">Sức khỏe người cao tuổi</span>
      </span>
    )}
  </button>
);

const SidebarNavigation = ({ collapsed, items, onMenuClick, selectedKey }) => (
  <div className="sidebar-menu">
    <Menu
      theme="dark"
      mode="inline"
      inlineCollapsed={collapsed}
      selectedKeys={[selectedKey]}
      items={items}
      onClick={onMenuClick}
    />
  </div>
);

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, logout, setUserData } = useAuth();
  const { hasPermission } = usePermission();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [unresolvedSos, setUnresolvedSos] = useState(0);
  const [headerKeyword, setHeaderKeyword] = useState('');
  const [activeAccountModal, setActiveAccountModal] = useState(null);

  const canViewAlerts = hasPermission('QLCANHBAO', 'xem');

  const navigationItems = useMemo(() => {
    const decorateItem = (item) => {
      const menuItem = { ...item };
      delete menuItem.adminOnly;
      return {
        ...menuItem,
        label: item.alertItem ? (
          <span className="sidebar-menu-label">
            <span>{item.label}</span>
            {unreadAlerts > 0 && <Badge count={unreadAlerts} size="small" overflowCount={99} />}
          </span>
        ) : item.label,
      };
    };
    const mainItems = MAIN_NAVIGATION
      .filter((item) => !item.permission || hasPermission(item.permission, 'xem'))
      .map(decorateItem);
    const systemItems = SYSTEM_NAVIGATION
      .filter((item) => hasPermission(item.permission, 'xem') && (!item.adminOnly || currentUser?.tenVaiTro === 'QuanTriVien'))
      .map(decorateItem);
    if (systemItems.length === 0) return mainItems;
    return [
      ...mainItems,
      { type: 'divider' },
      { type: 'group', label: 'HỆ THỐNG', children: systemItems },
    ];
  }, [hasPermission, unreadAlerts, currentUser?.tenVaiTro]);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width < MOBILE_BREAKPOINT);
      setCollapsed(width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT);
      if (width >= MOBILE_BREAKPOINT) setMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const refreshAlertCounters = useCallback(() => {
    if (!canViewAlerts) return;
    getAlerts({ trangThai: 'CHUA_XU_LY' })
      .then((alerts) => {
        setUnreadAlerts(alerts.length);
        setUnresolvedSos(alerts.filter((alert) => (
          alert.loaiCanhBao === 'KhanCap'
          || alert.loaiCanhBao === 'KHAN_CAP'
          || alert.mucDo === 'KhanCap'
          || alert.mucDo === 'KHAN_CAP'
        )).length);
      })
      .catch(() => {
        setUnreadAlerts(0);
        setUnresolvedSos(0);
      });
  }, [canViewAlerts]);

  useEffect(() => {
    refreshAlertCounters();
  }, [refreshAlertCounters]);

  const { soundState, canReceive, enableSound, disableSound, silenceAlarm } = useRealtimeAlerts(refreshAlertCounters);

  const handleMenuClick = ({ key }) => {
    navigate(key);
    if (isMobile) setMobileOpen(false);
  };

  const handleHeaderSearch = (value) => {
    const keyword = value.trim();
    const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
    navigate(`/ho-so-nguoi-cao-tuoi${query}`);
  };

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: 'Thông tin cá nhân' },
    { key: 'change-password', icon: <LockOutlined />, label: 'Đổi mật khẩu' },
    { key: 'login-history', icon: <HistoryOutlined />, label: 'Lịch sử đăng nhập' },
    { key: 'settings', icon: <SettingOutlined />, label: 'Cài đặt tài khoản' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true },
  ];

  const handleUserMenuClick = ({ key }) => {
    if (key === 'logout') logout();
    else setActiveAccountModal(key);
  };

  const renderSidebar = (mobile = false) => (
    <>
      <SidebarLogo
        collapsed={!mobile && collapsed}
        onClick={() => {
          navigate('/dashboard');
          setMobileOpen(false);
        }}
      />
      <SidebarNavigation
        collapsed={!mobile && collapsed}
        items={navigationItems}
        selectedKey={location.pathname}
        onMenuClick={handleMenuClick}
      />
      <div className="sidebar-footer">{(!collapsed || mobile) && '© 2026 CareSenior'}</div>
    </>
  );

  const userName = currentUser?.hoTen || currentUser?.tenDangNhap || 'Người dùng';
  const roleName = ROLE_LABELS[currentUser?.tenVaiTro]
    || currentUser?.vaiTroLabel
    || currentUser?.tenVaiTro
    || 'Người dùng hệ thống';
  const currentSiderWidth = isMobile ? 0 : (collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH);

  return (
    <Layout className="main-layout">
      {!isMobile && (
        <Sider
          className="app-sidebar"
          theme="dark"
          collapsed={collapsed}
          width={SIDEBAR_WIDTH}
          collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
        >
          {renderSidebar()}
        </Sider>
      )}

      {isMobile && (
        <>
          {mobileOpen && (
            <button
              type="button"
              className="sidebar-mobile-overlay"
              aria-label="Đóng menu"
              onClick={() => setMobileOpen(false)}
            />
          )}
          <aside className={`mobile-sidebar ${mobileOpen ? 'mobile-sidebar-open' : ''}`}>
            {renderSidebar(true)}
          </aside>
        </>
      )}

      <Layout className="main-shell" style={{ marginLeft: currentSiderWidth }}>
        <Header className="app-header">
          <div className="header-left">
            <Button
              className={isMobile ? 'header-hamburger-btn' : 'header-collapse-btn'}
              type="text"
              aria-label={isMobile ? 'Mở menu' : 'Thu gọn menu'}
              icon={isMobile
                ? <MenuOutlined />
                : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
              onClick={() => (isMobile ? setMobileOpen(true) : setCollapsed((value) => !value))}
            />
            {hasPermission('QLHOSONCT', 'xem') && (
              <Search
                className="header-search"
                value={headerKeyword}
                prefix={<SearchOutlined />}
                placeholder="Tìm người cao tuổi theo tên hoặc mã hồ sơ"
                allowClear
                enterButton="Tìm kiếm"
                onChange={(event) => setHeaderKeyword(event.target.value)}
                onSearch={handleHeaderSearch}
              />
            )}
          </div>

          <div className="header-right">
            {canViewAlerts && (
              <Badge count={unresolvedSos} size="small" overflowCount={99}>
                <Button
                  danger
                  type="primary"
                  className="header-sos-button"
                  icon={<AlertOutlined />}
                  onClick={() => navigate('/canh-bao?tab=sos')}
                >
                  Cảnh báo SOS
                </Button>
              </Badge>
            )}

            <NotificationCenter />

            {currentUser && (
              <Dropdown
                menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
                placement="bottomRight"
                arrow
              >
                <Space className="header-account" size={10}>
                  <Avatar className="header-avatar" size={40}>{getNameInitials(userName)}</Avatar>
                  <span className="header-user-info">
                    <span className="header-user-name">{userName}</span>
                    <span className="header-user-role">{roleName}</span>
                  </span>
                </Space>
              </Dropdown>
            )}
          </div>
        </Header>

        {canReceive && <SosAudioControls state={soundState} onEnable={enableSound}
          onDisable={disableSound} onSilence={silenceAlarm} />}

        <Content className="page-content">
          <Outlet />
        </Content>

        <AccountMenuModals
          activeModal={activeAccountModal}
          onClose={() => setActiveAccountModal(null)}
          user={currentUser}
          onUserUpdated={setUserData}
        />
      </Layout>
    </Layout>
  );
};

export default MainLayout;
