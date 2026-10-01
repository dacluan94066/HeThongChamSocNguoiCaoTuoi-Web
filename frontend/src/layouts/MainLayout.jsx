// MainLayout - Khung bố cục chính (Sidebar + Header + Content)
// Sidebar theme: #1B4965 | Responsive: icon-only ở tablet, Drawer ở mobile
import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Tooltip, Space } from 'antd';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  DashboardOutlined,
  UserOutlined,
  TeamOutlined,
  MedicineBoxOutlined,
  CalendarOutlined,
  HeartFilled,
  BellOutlined,
  PhoneOutlined,
  BookOutlined,
  BarChartOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ClockCircleOutlined,
  AlertOutlined,
  MenuOutlined,
  HeartOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import usePermission from '../hooks/usePermission';
import { getAlerts } from '../services/alertService';

const { Sider, Header, Content } = Layout;

// Màu sidebar
const SIDEBAR_BG = '#1B4965';

// Danh sách menu điều hướng
const menuItems = [
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: 'Tổng quan',
  },
  {
    key: 'quan-ly',
    icon: <TeamOutlined />,
    label: 'Quản lý hệ thống',
    children: [
      { key: '/nguoi-dung', icon: <UserOutlined />, label: 'Người dùng & phân quyền', permission: 'QLNGUOIDUNG' },
      { key: '/ho-so-nguoi-cao-tuoi', icon: <HeartOutlined />, label: 'Hồ sơ NCT', permission: 'QLHOSONCT' },
      { key: '/nguoi-cham-soc', icon: <TeamOutlined />, label: 'Người chăm sóc', permission: 'QLNGUOICHAMSOC' },
    ],
  },
  {
    key: 'thuoc',
    icon: <MedicineBoxOutlined />,
    label: 'Thuốc & Lịch',
    children: [
      { key: '/danh-muc-thuoc', icon: <MedicineBoxOutlined />, label: 'Danh mục thuốc', permission: 'QLTHUOC' },
      { key: '/lich-uong-thuoc', icon: <ClockCircleOutlined />, label: 'Lịch uống thuốc', permission: 'QLLICHUONGTHUOC' },
      { key: '/lich-kham-benh', icon: <CalendarOutlined />, label: 'Lịch khám bệnh', permission: 'QLLICHKHAM' },
    ],
  },
  {
    key: 'theo-doi',
    icon: <HeartFilled style={{ color: '#E15554' }} />,
    label: 'Theo dõi sức khỏe',
    children: [
      { key: '/chi-so-suc-khoe', icon: <HeartFilled />, label: 'Chỉ số sức khỏe', permission: 'QLCHISOSK' },
      { key: '/canh-bao', icon: <AlertOutlined />, label: 'Cảnh báo', permission: 'QLCANHBAO' },
    ],
  },
  {
    key: 'khac',
    icon: <BookOutlined />,
    label: 'Tiện ích',
    children: [
      { key: '/lien-he-khan-cap', icon: <PhoneOutlined />, label: 'Liên hệ khẩn cấp', permission: 'QLLIENHEKC' },
      { key: '/nhat-ky-cham-soc', icon: <BookOutlined />, label: 'Nhật ký chăm sóc', permission: 'QLNHATKY' },
      { key: '/bao-cao', icon: <BarChartOutlined />, label: 'Báo cáo', permission: 'QLBAOCAO' },
    ],
  },
];

// ---- Logo component ----
const SidebarLogo = ({ collapsed, onClick }) => (
  <div className="sidebar-logo" onClick={onClick}>
    <div className="sidebar-logo-icon">
      <HeartFilled style={{ color: 'white', fontSize: 20 }} />
    </div>
    {!collapsed && (
      <div className="sidebar-logo-text">
        <div className="sidebar-logo-title">CareSenior</div>
        <div className="sidebar-logo-subtitle">Sức khỏe người cao tuổi</div>
      </div>
    )}
  </div>
);

// ---- Menu nội dung ----
const SidebarMenu = ({ selectedKey, defaultOpenKeys, onMenuClick, items }) => (
  <div className="sidebar-menu">
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      defaultOpenKeys={defaultOpenKeys}
      items={items}
      onClick={onMenuClick}
      style={{
        border: 'none',
        background: 'transparent',
        fontSize: 15,
      }}
    />
  </div>
);

// ---- Main Layout ----
const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Desktop: collapsed sidebar (icon-only)
  const [collapsed, setCollapsed] = useState(false);
  // Mobile: drawer open
  const [mobileOpen, setMobileOpen] = useState(false);
  // Screen width tracking
  const [isMobile, setIsMobile] = useState(window.innerWidth < 600);
  const [isTablet, setIsTablet] = useState(window.innerWidth < 900 && window.innerWidth >= 600);

  const { user: currentUser, logout } = useAuth();
  const { hasPermission } = usePermission();
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  const visibleMenuItems = useMemo(() => menuItems
    .map((item) => {
      if (!item.children) return item;
      const children = item.children.filter((child) => hasPermission(child.permission, 'xem'));
      return children.length > 0 ? { ...item, children } : null;
    })
    .filter(Boolean), [hasPermission]);

  // Track window resize
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setIsMobile(w < 600);
      setIsTablet(w >= 600 && w < 900);
      // Auto collapse sidebar on tablet
      if (w < 900 && w >= 600) setCollapsed(true);
      if (w >= 900) setCollapsed(false);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!hasPermission('QLCANHBAO', 'xem')) return;
    getAlerts({ trangThai: 'CHUA_XU_LY' }).then((alerts) => {
      setUnreadAlerts(alerts.length);
    });
  }, [hasPermission]);

  const selectedKey = location.pathname;
  const openKeys = visibleMenuItems
    .filter((item) => item.children?.some((child) => location.pathname.startsWith(child.key)))
    .map((item) => item.key);

  const handleMenuClick = ({ key }) => {
    navigate(key);
    if (isMobile) setMobileOpen(false);
  };

  const handleLogout = () => {
    // logout() từ AuthContext tự xóa localStorage và chuyển về /login
    logout();
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Thông tin cá nhân',
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      danger: true,
      onClick: handleLogout,
    },
  ];

  // Chiều rộng sidebar (fixed)
  const siderWidth = 240;
  const siderCollapsedWidth = 64;
  const currentSiderWidth = isMobile ? 0 : (collapsed ? siderCollapsedWidth : siderWidth);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* ===== SIDEBAR DESKTOP (hidden on mobile) ===== */}
      {!isMobile && (
        <Sider
          className="app-sidebar"
          theme="dark"
          collapsed={collapsed}
          width={siderWidth}
          collapsedWidth={siderCollapsedWidth}
          style={{ background: SIDEBAR_BG }}
        >
          <SidebarLogo collapsed={collapsed} onClick={() => navigate('/dashboard')} />
          <SidebarMenu
            selectedKey={selectedKey}
            defaultOpenKeys={openKeys}
            onMenuClick={handleMenuClick}
            items={visibleMenuItems}
          />
          <div className="sidebar-footer">
            {!collapsed && '© 2024 CareSenior'}
          </div>
        </Sider>
      )}

      {/* ===== SIDEBAR MOBILE (Drawer) ===== */}
      {isMobile && (
        <>
          {mobileOpen && (
            <div
              className="sidebar-mobile-overlay"
              style={{ display: 'block' }}
              onClick={() => setMobileOpen(false)}
            />
          )}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              height: '100vh',
              width: siderWidth,
              background: SIDEBAR_BG,
              zIndex: 300,
              transform: mobileOpen ? 'translateX(0)' : `translateX(-${siderWidth}px)`,
              transition: 'transform 0.25s ease',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <SidebarLogo collapsed={false} onClick={() => { navigate('/dashboard'); setMobileOpen(false); }} />
            <SidebarMenu
              selectedKey={selectedKey}
              defaultOpenKeys={openKeys}
              onMenuClick={handleMenuClick}
              items={visibleMenuItems}
            />
            <div className="sidebar-footer">© 2024 CareSenior</div>
          </div>
        </>
      )}

      {/* ===== MAIN AREA ===== */}
      <Layout style={{ marginLeft: currentSiderWidth, transition: 'margin-left 0.2s ease' }}>
        {/* Header */}
        <Header className="app-header">
          <div className="header-left">
            {/* Hamburger (mobile) */}
            {isMobile && (
              <Button
                className="header-hamburger-btn"
                type="text"
                icon={<MenuOutlined style={{ fontSize: 20 }} />}
                onClick={() => setMobileOpen(!mobileOpen)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: '#3D5263',
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                }}
              />
            )}

            {/* Collapse button (tablet/desktop) */}
            {!isMobile && (
              <Button
                className="header-collapse-btn"
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
              />
            )}
          </div>

          <div className="header-right">
            {/* Chuông cảnh báo */}
            {hasPermission('QLCANHBAO', 'xem') && <Tooltip title={`${unreadAlerts} cảnh báo chưa xử lý`}>
              <Badge count={unreadAlerts} size="small" offset={[-2, 2]}>
                <Button
                  type="text"
                  icon={<BellOutlined style={{ fontSize: 20 }} />}
                  onClick={() => navigate('/canh-bao')}
                  style={{
                    color: unreadAlerts > 0 ? '#E15554' : '#7A93A3',
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  className={unreadAlerts > 0 ? 'pulse-danger' : ''}
                />
              </Badge>
            </Tooltip>}

            {/* Thông tin người dùng */}
            {currentUser && (
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" arrow>
                <Space style={{ cursor: 'pointer', gap: 10 }}>
                  <Avatar
                    style={{ backgroundColor: '#2E7D9A' }}
                    icon={<UserOutlined />}
                    size={36}
                    className="header-avatar"
                  />
                  <div className="header-user-info" style={{ display: isMobile ? 'none' : 'block' }}>
                    <div className="header-user-name">{currentUser.hoTen}</div>
                    <div className="header-user-role">{currentUser.tenVaiTro ?? currentUser.vaiTroLabel}</div>
                  </div>
                </Space>
              </Dropdown>
            )}
          </div>
        </Header>

        {/* Nội dung chính */}
        <Content className="page-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
