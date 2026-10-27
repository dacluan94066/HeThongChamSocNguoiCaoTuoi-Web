import React from 'react';
import { Button, Result, Spin } from 'antd';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getWebHome, isRelativeUser, isElderlyUser, STAFF_WEB_ROLES } from '../utils/accessControl';

const WorkspaceDenied = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  return <Result status="403" title="Bạn không có quyền truy cập giao diện này"
    subTitle="Vui lòng sử dụng không gian dành cho vai trò tài khoản của bạn."
    extra={<Button type="primary" onClick={() => navigate(getWebHome(user), { replace: true })}>Về trang của tôi</Button>} />;
};
export const WebHomeRoute = () => {
  const { user, authLoading, permissionsLoading, authError, retrySession } = useAuth();
  if (authLoading || permissionsLoading) return <Spin description="Đang kiểm tra phiên đăng nhập..." />;
  if (authError) return <Result status="warning" title={authError} extra={<Button onClick={() => { void retrySession().catch(() => {}); }}>Thử lại</Button>} />;
  return <Navigate to={user ? getWebHome(user) : '/login'} replace />;
};
export const StaffWorkspaceRoute = ({ children }) => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (isRelativeUser(user) && (pathname === '/' || pathname === '/dashboard')) return <Navigate to={getWebHome(user)} replace />;
  if (isElderlyUser(user) && pathname === '/') return <Navigate to={getWebHome(user)} replace />;
  return STAFF_WEB_ROLES.includes(user?.tenVaiTro) ? children : <WorkspaceDenied />;
};
export const RelativeWorkspaceRoute = ({ children }) => {
  const { user } = useAuth();
  return isRelativeUser(user) ? children : <WorkspaceDenied />;
};
export const ElderlyWorkspaceRoute = ({ children }) => {
  const { user } = useAuth();
  return isElderlyUser(user) ? children : <WorkspaceDenied />;
};
