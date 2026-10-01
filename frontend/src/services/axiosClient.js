// axiosClient.js - Cấu hình Axios dùng chung cho toàn bộ ứng dụng
import axios from 'axios';
import { message } from 'antd';

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
  (response) => response,

  // Nếu có lỗi, xử lý theo mã lỗi HTTP
  (error) => {
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
      // Token hết hạn hoặc không hợp lệ → xóa và chuyển về login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Chuyển hướng mà không dùng useNavigate (vì đây không phải component)
      window.location.href = '/login';
    } else if (status === 403 && data?.errorCode !== 'WEB_ACCESS_DENIED') {
      // Không đủ quyền truy cập (dùng key để tránh hiện nhiều thông báo đè nhau)
      message.error({
        content: 'Bạn không có quyền thực hiện thao tác này',
        key: 'forbidden_error',
        duration: 4,
      });
    } else {
      // Các lỗi khác: lấy message từ response nếu có
      const errMsg =
        data?.message || `Lỗi máy chủ (${status}), vui lòng thử lại sau.`;
      message.error(errMsg, 4);
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
