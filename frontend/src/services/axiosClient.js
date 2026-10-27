// axiosClient.js - Cấu hình Axios dùng chung cho toàn bộ ứng dụng
import axios from 'axios';
import { message } from 'antd';
import { webSession, sessionChangedError } from '../utils/webSession';

const publicAuth = config => ['/auth/login', '/auth/register', '/auth/register-caregiver',
  '/auth/forgot-password', '/auth/verify-otp', '/auth/reset-password-with-token',
  '/auth/google/web/config', '/auth/google/web/login/challenge', '/auth/google/web/login']
  .includes(config?.url?.split('?')[0]);

// Tạo instance axios với baseURL lấy từ biến môi trường
const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000, // 15 giây timeout
});

// ─── Request Interceptor ─────────────────────────────────────────────────────
// Tự động gắn token vào mỗi request nếu có trong localStorage
axiosClient.interceptors.request.use(
  (config) => {
    if (!publicAuth(config)) {
      config.webSessionStamp ??= webSession.capture();
      if (!webSession.isCurrent(config.webSessionStamp)) throw sessionChangedError();
    }
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor ────────────────────────────────────────────────────
// Xử lý các lỗi phổ biến tập trung tại một nơi
axiosClient.interceptors.response.use(
  // Nếu thành công, trả về response bình thường
  (response) => {
    if (!publicAuth(response.config) && !webSession.isCurrent(response.config.webSessionStamp)) throw sessionChangedError();
    return response;
  },

  // Nếu có lỗi, xử lý theo mã lỗi HTTP
  (error) => {
    // Scoped reads cancel on selection/session changes; this is not a network outage.
    if (error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }
    if (error.config?.webSessionStamp && !webSession.isCurrent(error.config.webSessionStamp)) {
      return Promise.reject(sessionChangedError());
    }
    // The personal workspace renders its own field/error states.
    if ((error.config?.elderlyPortalRequest || error.config?.googleWebRequest) && error.response?.status !== 401) return Promise.reject(error);
    if (!error.response) {
      // Lỗi mạng — backend chưa chạy hoặc không kết nối được
      message.error(
        'Không thể kết nối máy chủ, vui lòng kiểm tra lại backend',
        5
      );
      return Promise.reject(error);
    }

    const { status, data } = error.response;

    if (status === 401) {
      const isPublicAuthRequest = publicAuth(error.config);

      // Sai thông tin đăng nhập phải được LoginPage tự hiển thị, không reload trang.
      // Chỉ chuyển về /login khi token của một request đã xác thực bị hết hạn/sai.
      if (!isPublicAuthRequest) {
        webSession.clear(error.config?.webSessionStamp);

        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
    } else if (status === 403) {
      if (!['WEB_ACCESS_DENIED', 'ACCOUNT_PENDING_APPROVAL'].includes(data?.errorCode)) {
        message.error({
          content: 'Bạn không có quyền thực hiện thao tác này',
          key: 'forbidden_error',
          duration: 4,
        });
      }
    } else if (status === 409 && data?.errorCode === 'DOSE_CHANGED'
      && error.config?.method === 'patch'
      && /^\/medication-schedules\/\d+\/status$/.test(error.config?.url?.split('?')[0] || '')) {
      message.warning({
        key: 'medication-dose-changed',
        content: 'Liều thuốc đã được cập nhật từ phiên hoặc thiết bị khác. Đang tải lại lịch; vui lòng kiểm tra trạng thái mới nhất trước khi thao tác.',
        duration: 6,
      });
    } else if (!error.config?.url?.includes('/auth/register-caregiver')) {
      // Các lỗi khác: lấy message từ response nếu có
      const errMsg =
        data?.message || `Lỗi máy chủ (${status}), vui lòng thử lại sau.`;
      message.error(errMsg, 4);
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
