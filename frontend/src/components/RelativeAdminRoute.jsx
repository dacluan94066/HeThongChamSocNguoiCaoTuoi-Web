import React from 'react';
import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '../context/AuthContext';
import { canViewRelativeAdmin } from '../utils/relativeAdmin';

const RelativeAdminRoute = ({ children }) => {
  const { user, hasPermission, authLoading, permissionsLoading } = useAuth();
  if (authLoading || permissionsLoading) return <Spin description="Đang kiểm tra quyền quản trị..." />;
  if (!canViewRelativeAdmin(user, hasPermission)) return <Navigate to="/forbidden" replace />;
  return children;
};
export default RelativeAdminRoute;
