// AuthContext.jsx - Quản lý trạng thái đăng nhập toàn bộ ứng dụng
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axiosClient from '../services/axiosClient';
import { getMyPermissions } from '../services/permissionService';

// ─── Tạo Context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ─── AuthProvider ─────────────────────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);          // Thông tin user đang đăng nhập
  const [authLoading, setAuthLoading] = useState(true); // Đang khởi tạo phiên
  const [permissions, setPermissions] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);

  // Khi app khởi động: nếu có token trong localStorage thì gọi GET /auth/me
  // để khôi phục thông tin user và duy trì phiên đăng nhập
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setAuthLoading(false);
        return;
      }
      setPermissionsLoading(true);
      try {
        const [res, permissionData] = await Promise.all([
          axiosClient.get('/auth/me'),
          getMyPermissions(),
        ]);
        // Backend trả về thông tin user trong res.data.data hoặc res.data.user
        const userData = res.data?.data || res.data?.user || res.data;
        setUser(userData);
        setPermissions(permissionData);
      } catch {
        // Token không hợp lệ hoặc hết hạn → xóa khỏi localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setPermissions([]);
      } finally {
        setPermissionsLoading(false);
        setAuthLoading(false);
      }
    };

    restoreSession();
  }, []);

  // Hàm đăng xuất: xóa token + user khỏi localStorage, reset state, về /login
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setPermissions([]);
    window.location.href = '/login';
  }, []);

  // Hàm cập nhật user sau khi đăng nhập thành công
  const setUserData = useCallback(async (userData) => {
    setPermissionsLoading(true);
    try {
      const permissionData = await getMyPermissions();
      setPermissions(permissionData);
      setUser(userData);
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  const hasPermission = useCallback((maChucNang, hanhDong = 'xem') => {
    const permission = permissions.find((item) => item.maChucNang === maChucNang);
    return Boolean(permission?.[hanhDong]);
  }, [permissions]);

  const value = {
    user,           // Thông tin user: { userId, hoTen, vaiTroId, tenVaiTro, ... }
    authLoading,    // true khi đang khôi phục phiên lúc app mới mở
    permissions,
    permissionsLoading,
    hasPermission,
    logout,
    setUserData,
    isAuthenticated: !!user, // shorthand để check đăng nhập nhanh
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ─── Custom Hook ──────────────────────────────────────────────────────────────
// Hook tiện lợi để dùng trong các component
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth phải được dùng bên trong AuthProvider');
  }
  return ctx;
};

export default AuthContext;
