import React, { useState } from 'react';
import { Form, Input, Button, Checkbox, Alert, Typography } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  HeartFilled,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  login,
  isAuthenticated,
  logout as clearStoredAuth,
} from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { canAccessWeb } from '../../utils/accessControl';
import loginIllustration from '../../assets/login_illustration.png';
import ForgotPasswordModal from './ForgotPasswordModal';
import './Login.css';

const { Title, Text } = Typography;

// --- Component phần illustration bên trái ---
const LoginIllustration = () => (
  <div className="login-illustration-panel">
    {/* Decorative blobs */}
    <div className="illus-blob illus-blob-1" />
    <div className="illus-blob illus-blob-2" />

    <div className="illus-content">
      {/* Logo + Tên hệ thống */}
      <div className="illus-logo-row">
        <div className="illus-logo-icon">
          <HeartFilled style={{ color: '#fff', fontSize: 28 }} />
        </div>
        <span className="illus-system-name">CareSenior</span>
      </div>

      {/* Hình minh họa */}
      <div className="illus-image-wrap">
        <img
          src={loginIllustration}
          alt="Chăm sóc sức khỏe người cao tuổi"
          className="illus-image"
          draggable={false}
        />
      </div>

      {/* Tiêu đề & Slogan */}
      <div className="illus-text">
        <h1 className="illus-title">Hệ thống Quản lý<br />Sức khỏe Người cao tuổi</h1>
        <p className="illus-slogan">
          Kết nối nhân viên y tế, người thân và bệnh nhân<br />
          trong một nền tảng chăm sóc toàn diện, đáng tin cậy.
        </p>
      </div>

      {/* Thống kê nhỏ */}
      <div className="illus-stats">
        <div className="illus-stat-item">
          <span className="illus-stat-num">500+</span>
          <span className="illus-stat-label">Bệnh nhân</span>
        </div>
        <div className="illus-stat-divider" />
        <div className="illus-stat-item">
          <span className="illus-stat-num">50+</span>
          <span className="illus-stat-label">Nhân viên y tế</span>
        </div>
        <div className="illus-stat-divider" />
        <div className="illus-stat-item">
          <span className="illus-stat-num">24/7</span>
          <span className="illus-stat-label">Theo dõi</span>
        </div>
      </div>
    </div>
  </div>
);

// --- Component form đăng nhập ---
const LoginForm = ({ onSubmit, onForgotPassword, loading, errorMsg, alertType }) => {
  const [form] = Form.useForm();

  return (
    <div className="login-form-panel">
      <div className="login-form-inner">
        {/* Mobile logo (chỉ hiện trên mobile) */}
        <div className="login-mobile-logo">
          <div className="mobile-logo-icon">
            <HeartFilled style={{ color: '#fff', fontSize: 22 }} />
          </div>
          <span className="mobile-system-name">CareSenior</span>
        </div>

        {/* Header form */}
        <div className="login-form-header">
          <Title level={2} className="login-form-title">Đăng nhập hệ thống</Title>
          <Text className="login-form-subtitle">Chào mừng bạn trở lại. Vui lòng nhập thông tin để tiếp tục.</Text>
        </div>

        {/* Thông báo lỗi */}
        {errorMsg && (
          <Alert
            message={alertType === 'warning' ? 'Không thể truy cập Web' : 'Đăng nhập thất bại'}
            description={errorMsg}
            type={alertType}
            showIcon
            closable
            className="login-error-alert"
          />
        )}

        {/* Form — dùng tên field khớp đúng với backend: tenDangNhap, matKhau */}
        <Form
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          className="login-form"
          size="large"
          autoComplete="off"
        >
          <Form.Item
            name="tenDangNhap"
            label="Tên đăng nhập"
            rules={[
              { required: true, message: 'Vui lòng nhập tên đăng nhập' },
              { min: 3, message: 'Tên đăng nhập ít nhất 3 ký tự' },
            ]}
            hasFeedback
          >
            <Input
              prefix={<UserOutlined className="input-prefix-icon" />}
              placeholder="Nhập tên đăng nhập"
              className="login-input"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="matKhau"
            label="Mật khẩu"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu' },
            ]}
            hasFeedback
          >
            <Input.Password
              prefix={<LockOutlined className="input-prefix-icon" />}
              placeholder="Nhập mật khẩu"
              className="login-input"
              autoComplete="current-password"
            />
          </Form.Item>

          {/* Remember + Forgot */}
          <Form.Item style={{ marginBottom: 8 }}>
            <div className="login-options-row">
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox className="login-remember-checkbox">Ghi nhớ đăng nhập</Checkbox>
              </Form.Item>
              <button
                type="button"
                className="login-forgot-link"
                onClick={onForgotPassword}
              >
                Quên mật khẩu?
              </button>
            </div>
          </Form.Item>

          {/* Submit */}
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              className="login-submit-btn"
            >
              {loading ? 'Đang xử lý...' : 'Đăng nhập'}
            </Button>
          </Form.Item>

        </Form>

        {/* Footer */}
        <div className="login-footer">
          © {new Date().getFullYear()} Hệ thống Quản lý Sức khỏe Người cao tuổi
        </div>
      </div>
    </div>
  );
};

// --- Trang chính ---
const LoginPage = () => {
  const navigate = useNavigate();
  const { setUserData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [alertType, setAlertType] = useState('error');
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  // Nếu đã đăng nhập, chuyển về dashboard
  React.useEffect(() => {
    if (isAuthenticated()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  // Xử lý submit: gọi POST /auth/login với { tenDangNhap, matKhau }
  const handleSubmit = async (values) => {
    setLoading(true);
    setErrorMsg('');
    setAlertType('error');
    try {
      const { user } = await login(values.tenDangNhap, values.matKhau, 'web');

      if (!canAccessWeb(user)) {
        clearStoredAuth();
        setAlertType('warning');
        setErrorMsg('Tài khoản này chỉ sử dụng được trên ứng dụng Mobile, vui lòng tải app để đăng nhập.');
        return;
      }

      // Cập nhật user vào AuthContext để toàn app biết ngay
      if (user) await setUserData(user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const errorCode = err.response?.data?.errorCode;

      if (errorCode === 'WEB_ACCESS_DENIED') {
        clearStoredAuth();
        setAlertType('warning');
        setErrorMsg('Tài khoản này chỉ sử dụng được trên ứng dụng Mobile, vui lòng tải app để đăng nhập.');
        return;
      }

      if (errorCode === 'INVALID_CREDENTIALS') {
        setErrorMsg('Tên đăng nhập hoặc mật khẩu không chính xác.');
        return;
      }

      // Lấy message từ response của backend, hoặc dùng message mặc định
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Đăng nhập thất bại. Vui lòng thử lại.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <LoginIllustration />
      <LoginForm
        onSubmit={handleSubmit}
        onForgotPassword={() => setForgotPasswordOpen(true)}
        loading={loading}
        errorMsg={errorMsg}
        alertType={alertType}
      />
      <ForgotPasswordModal
        open={forgotPasswordOpen}
        onClose={() => setForgotPasswordOpen(false)}
      />
    </div>
  );
};

export default LoginPage;
