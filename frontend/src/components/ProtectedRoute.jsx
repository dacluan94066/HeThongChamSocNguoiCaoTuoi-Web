// Component bảo vệ route - Yêu cầu đăng nhập
// Dùng AuthContext để kiểm tra trạng thái đăng nhập và chờ session được khôi phục
import React from 'react';
import { Navigate } from 'react-router-dom';
import { Button, Result, Spin } from 'antd';
import { useAuth } from '../context/AuthContext';
import { canAccessWeb } from '../utils/accessControl';

const ProtectedRoute = ({ children }) => {
  const { user, isAuthenticated, authLoading, permissionsLoading, authError, retrySession, logout } = useAuth();

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
        <Spin size="large" description="Đang tải..." />
      </div>
    );
  }

  if (authError) return <Result status="warning" title="Chưa thể kiểm tra phiên đăng nhập" subTitle={authError}
    extra={[<Button key="retry" type="primary" onClick={() => { void retrySession().catch(() => {}); }}>Thử lại</Button>,
      <Button key="logout" onClick={logout}>Đăng xuất</Button>]} />;

  // Chưa đăng nhập → chuyển về trang login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Workspace guards below this boundary keep the four roles separate.
  if (!canAccessWeb(user)) {
    return (
      <Result
        status="403"
        title="Không thể truy cập CareSenior Web"
        subTitle="Vai trò tài khoản này chưa được hỗ trợ trên Web."
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
