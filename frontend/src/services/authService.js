// authService.js - Service xác thực người dùng
// Kết nối với backend API thật qua axiosClient
import axiosClient from './axiosClient';

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

// ─── Đăng ký tài khoản ──────────────────────────────────────────────────────
export const register = async (userData) => {
  const res = await axiosClient.post('/auth/register', userData);
  return res.data;
};
