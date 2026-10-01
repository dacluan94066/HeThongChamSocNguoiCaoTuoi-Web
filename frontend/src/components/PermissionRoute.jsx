import React from 'react';
import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import usePermission from '../hooks/usePermission';

const FullPageLoading = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Spin size="large" tip="Đang tải quyền truy cập..." />
  </div>
);

const PermissionRoute = ({ maChucNang, children }) => {
  const { permissionsLoading, hasPermission } = usePermission();

  if (permissionsLoading) return <FullPageLoading />;
  if (!hasPermission(maChucNang, 'xem')) return <Navigate to="/forbidden" replace />;

  return children;
};

export default PermissionRoute;
