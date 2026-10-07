// authService.js - Service xác thực người dùng
// Kết nối với backend API thật qua axiosClient
import axiosClient from './axiosClient';
import { disconnectSocket } from './socketClient';

// ─── Đăng nhập ───────────────────────────────────────────────────────────────
// Gọi POST /auth/login với body { tenDangNhap, matKhau, platform }
// Backend trả về: { success, data: { token, user: { userId, hoTen, vaiTroId, tenVaiTro, ... } } }
export const login = async (tenDangNhap, matKhau, platform = 'web') => {
  const res = await axiosClient.post('/auth/login', { tenDangNhap, matKhau, platform });
  const { token, user } = res.data?.data || {};

  if (!token) throw new Error('Đăng nhập thất bại: không nhận được token từ máy chủ');

  // Lưu token và thông tin user vào localStorage
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));

  return { token, user };
};

// ─── Đăng xuất ───────────────────────────────────────────────────────────────
export const logout = () => {
  disconnectSocket();
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

// ─── Lấy thông tin user hiện tại từ localStorage ────────────────────────────
export const getCurrentUser = () => {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
};

// ─── Kiểm tra đã đăng nhập chưa (dựa trên token trong localStorage) ─────────
export const isAuthenticated = () => !!localStorage.getItem('token');

// ─── Lấy thông tin user từ server (dùng khi khôi phục phiên) ────────────────
export const getMe = async () => {
  const res = await axiosClient.get('/auth/me');
  return res.data?.data || res.data?.user || res.data;
};

// Cap nhat thong tin tai khoan hien tai
export const updateMyProfile = async (profileData) => {
  const res = await axiosClient.put('/auth/me', profileData);
  return res.data?.data ?? res.data;
};

// Doi mat khau cua tai khoan hien tai
export const changeMyPassword = async (matKhauHienTai, matKhauMoi) => {
  const res = await axiosClient.post('/auth/change-password', { matKhauHienTai, matKhauMoi });
  return res.data;
};

// Lay 50 lan dang nhap gan nhat
export const getLoginHistory = async () => {
  const res = await axiosClient.get('/auth/login-history');
  return res.data?.data ?? [];
};

// ─── Đăng ký tài khoản ──────────────────────────────────────────────────────
export const register = async (userData) => {
  const res = await axiosClient.post('/auth/register', userData);
  return res.data;
};

export const forgotPassword = async ({ email, tenDangNhap }) => {
  const res = await axiosClient.post('/auth/forgot-password', { email, tenDangNhap });
  return res.data;
};

export const verifyPasswordOtp = async ({ email, tenDangNhap, otp }) => {
  const res = await axiosClient.post('/auth/verify-otp', { email, tenDangNhap, otp });
  const resetToken = res.data?.data?.resetToken;
  if (!resetToken) throw new Error('Máy chủ không trả về phiên đặt lại mật khẩu');
  return resetToken;
};

export const resetPasswordWithToken = async (resetToken, matKhauMoi) => {
  const res = await axiosClient.post('/auth/reset-password-with-token', {
    resetToken,
    matKhauMoi,
  });
  return res.data;
};
