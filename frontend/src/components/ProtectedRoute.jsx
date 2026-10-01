// Component bảo vệ route - Yêu cầu đăng nhập
// Dùng AuthContext để kiểm tra trạng thái đăng nhập và chờ session được khôi phục
import React from 'react';
import { Navigate } from 'react-router-dom';
import { Button, Result, Spin } from 'antd';
import { useAuth } from '../context/AuthContext';
import { canAccessWeb } from '../utils/accessControl';

const ProtectedRoute = ({ children }) => {
  const { user, isAuthenticated, authLoading, permissionsLoading, logout } = useAuth();

  // Đang khôi phục phiên đăng nhập từ token → hiện spinner, chưa chuyển trang
  if (authLoading || permissionsLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Spin size="large" tip="Đang tải..." />
      </div>
    );
  }

  // Chưa đăng nhập → chuyển về trang login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Web chi danh cho quan tri vien va bac si.
  // Kiem tra tai route goc de ngan truy cap truc tiep bang URL.
  if (!canAccessWeb(user)) {
    return (
      <Result
        status="403"
        title="Không thể truy cập Web quản trị"
        subTitle="Tài khoản người cao tuổi chỉ được sử dụng trên ứng dụng Mobile."
        extra={
          <Button type="primary" onClick={logout}>
            Quay lại đăng nhập
          </Button>
        }
      />
    );
  }

  return children;
};

export default ProtectedRoute;
