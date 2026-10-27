// AuthContext.jsx - Quản lý trạng thái đăng nhập toàn bộ ứng dụng
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axiosClient from '../services/axiosClient';
import { getMyPermissions } from '../services/permissionService';
import { connectSocket, disconnectSocket } from '../services/socketClient';
import { webSession, sessionChangedError } from '../utils/webSession';

// ─── Tạo Context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ─── AuthProvider ─────────────────────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);          // Thông tin user đang đăng nhập
  const [authLoading, setAuthLoading] = useState(true); // Đang khởi tạo phiên
  const [permissions, setPermissions] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const alive = useRef(false);
  const inFlight = useRef(null);
  const activeRequest = useRef(null);

  // Verify the server identity again on reload or a storage change in another tab.
  // A late response must never restore the account that just signed out.
  const retrySession = useCallback(() => {
    const stamp = webSession.capture();
    if (inFlight.current && webSession.isCurrent(inFlight.current.stamp)) return inFlight.current.promise;
    activeRequest.current?.abort();
    disconnectSocket();
    setUser(null); setPermissions([]); setAuthError(null);
    if (!stamp.token) {
      setAuthLoading(false); setPermissionsLoading(false); inFlight.current = null;
      return Promise.resolve(null);
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    const current = () => alive.current && !controller.signal.aborted && webSession.isCurrent(stamp);
    setAuthLoading(true); setPermissionsLoading(true);
    const promise = (async () => {
      try {
        const [res, permissionData] = await Promise.all([
          axiosClient.get('/auth/me', { signal: controller.signal, webSessionStamp: stamp }),
          getMyPermissions({ signal: controller.signal, webSessionStamp: stamp }),
        ]);
        if (!current()) throw sessionChangedError();
        const userData = res.data?.data || res.data?.user || res.data;
        if (!userData?.userId || !userData?.tenVaiTro) throw new Error('Thông tin phiên đăng nhập không hợp lệ.');
        webSession.updateUser(userData, stamp);
        setUser(userData);
        setPermissions(permissionData);
        return userData;
      } catch (error) {
        if (current() && error.code !== 'ERR_CANCELED') {
          setAuthError(error.response?.status === 403
            ? 'Tài khoản chưa có quyền sử dụng chức năng này. Vui lòng liên hệ quản trị viên.'
            : 'Không thể kiểm tra phiên đăng nhập. Kiểm tra kết nối và thử lại.');
        }
        throw error;
      } finally {
        if (current()) { setPermissionsLoading(false); setAuthLoading(false); }
        if (inFlight.current?.stamp === stamp) inFlight.current = null;
      }
    })();
    inFlight.current = { stamp, promise };
    return promise;
  }, []);

  useEffect(() => {
    alive.current = true;
    const refresh = () => { void retrySession().catch(() => {}); };
    const unsubscribe = webSession.subscribe(refresh);
    refresh();
    return () => { alive.current = false; activeRequest.current?.abort(); inFlight.current = null; unsubscribe(); };
  }, [retrySession]);

  useEffect(() => {
    if (user && localStorage.getItem('token')) connectSocket();
    else disconnectSocket();
  }, [user]);

  // Hàm đăng xuất: xóa token + user khỏi localStorage, reset state, về /login
  const logout = useCallback(() => {
    disconnectSocket();
    webSession.clear();
    setUser(null);
    setPermissions([]);
    window.location.href = '/login';
  }, []);

  // Hàm cập nhật user sau khi đăng nhập thành công
  const setUserData = useCallback(async () => {
    const verified = await retrySession();
    if (!verified) throw sessionChangedError();
    return verified;
  }, [retrySession]);

  const hasPermission = useCallback((maChucNang, hanhDong = 'xem') => {
    const permission = permissions.find((item) => item.maChucNang === maChucNang);
    return Boolean(permission?.[hanhDong]);
  }, [permissions]);

  const value = {
    user,           // Thông tin user: { userId, hoTen, vaiTroId, tenVaiTro, ... }
    authLoading,    // true khi đang khôi phục phiên lúc app mới mở
    permissions,
    permissionsLoading,
    authError,
    retrySession,
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
