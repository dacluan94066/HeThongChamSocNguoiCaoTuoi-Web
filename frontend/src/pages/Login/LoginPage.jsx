import React, { useState } from 'react';
import { Form, Input, Button, Checkbox, Alert, Typography, Modal, message } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  HeartFilled,
  UserAddOutlined,
  MailOutlined,
  PhoneOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  login,
  register,
  isAuthenticated,
  logout as clearStoredAuth,
} from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { canAccessWeb } from '../../utils/accessControl';
import loginIllustration from '../../assets/login_illustration.png';
import './Login.css';

const { Title, Text } = Typography;

// --- Modal Đăng ký tài khoản mới ---
const RegisterModal = ({ open, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async (values) => {
    setSubmitting(true);
    try {
      await register({
        tenDangNhap: values.tenDangNhap,
        matKhau: values.matKhau,
        hoTen: values.hoTen,
        email: values.email || undefined,
        soDienThoai: values.soDienThoai || undefined,
      });
      message.success('Đăng ký tài khoản thành công! Bạn có thể đăng nhập ngay.');
      form.resetFields();
      onSuccess(values.tenDangNhap, values.matKhau);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Đăng ký thất bại';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18 }}>
          <UserAddOutlined style={{ color: '#0e7490' }} />
          <span>Đăng ký tài khoản</span>
        </div>
      }
      open={open}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      footer={null}
      destroyOnClose
      centered
    >
      <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 16 }}>
        <Form.Item
          name="hoTen"
          label="Họ và tên"
          rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
        >
          <Input prefix={<IdcardOutlined />} placeholder="Ví dụ: Nguyễn Văn A" />
        </Form.Item>

        <Form.Item
          name="tenDangNhap"
          label="Tên đăng nhập"
          rules={[
            { required: true, message: 'Vui lòng nhập tên đăng nhập' },
            { min: 3, message: 'Tên đăng nhập ít nhất 3 ký tự' },
          ]}
        >
          <Input prefix={<UserOutlined />} placeholder="Tên đăng nhập viết liền" />
        </Form.Item>

        <Form.Item
          name="matKhau"
          label="Mật khẩu"
          rules={[
            { required: true, message: 'Vui lòng nhập mật khẩu' },
            { min: 6, message: 'Mật khẩu ít nhất 6 ký tự' },
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu tối thiểu 6 ký tự" />
        </Form.Item>

        <Form.Item
          name="xacNhanMatKhau"
          label="Xác nhận mật khẩu"
          dependencies={['matKhau']}
          rules={[
            { required: true, message: 'Vui lòng xác nhận lại mật khẩu' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('matKhau') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
              },
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} placeholder="Nhập lại mật khẩu" />
        </Form.Item>

        <Form.Item
          name="soDienThoai"
          label="Số điện thoại"
          rules={[{ pattern: /^[0-9]{10,11}$/, message: 'Số điện thoại không hợp lệ' }]}
        >
          <Input prefix={<PhoneOutlined />} placeholder="Số điện thoại liên hệ" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email"
          rules={[{ type: 'email', message: 'Email không đúng định dạng' }]}
        >
          <Input prefix={<MailOutlined />} placeholder="Địa chỉ email" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={onCancel}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Đăng ký
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};

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
const LoginForm = ({ onSubmit, loading, errorMsg, onOpenRegister, autoFill }) => {
  const [form] = Form.useForm();

  // Tự động điền khi đăng ký thành công
  React.useEffect(() => {
    if (autoFill) {
      form.setFieldsValue({ tenDangNhap: autoFill.tenDangNhap, matKhau: autoFill.matKhau });
      form.validateFields(['tenDangNhap', 'matKhau']).catch(() => {});
    }
  }, [autoFill, form]);

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
            message="Đăng nhập thất bại"
            description={errorMsg}
            type="error"
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
              { min: 6, message: 'Mật khẩu ít nhất 6 ký tự' },
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
              <a className="login-forgot-link" href="#forgot">Quên mật khẩu?</a>
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

          {/* Link Đăng ký tài khoản */}
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Text type="secondary" style={{ fontSize: 14 }}>Chưa có tài khoản? </Text>
            <Button
              type="link"
              onClick={onOpenRegister}
              style={{ padding: 0, fontWeight: 600, color: '#0891b2', fontSize: 14 }}
            >
              Đăng ký ngay
            </Button>
          </div>
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
  const [showRegister, setShowRegister] = useState(false);
  const [autoFill, setAutoFill] = useState(null);

  // Nếu đã đăng nhập, chuyển về dashboard
  React.useEffect(() => {
    if (isAuthenticated()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  // Xử lý khi đăng ký thành công
  const handleRegisterSuccess = (tenDangNhap, matKhau) => {
    setShowRegister(false);
    setAutoFill({ tenDangNhap, matKhau });
  };

  // Xử lý submit: gọi POST /auth/login với { tenDangNhap, matKhau }
  const handleSubmit = async (values) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { user } = await login(values.tenDangNhap, values.matKhau);

      if (!canAccessWeb(user)) {
        clearStoredAuth();
        setErrorMsg('Tài khoản người cao tuổi chỉ được sử dụng trên ứng dụng Mobile.');
        return;
      }

      // Cập nhật user vào AuthContext để toàn app biết ngay
      if (user) setUserData(user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
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
        loading={loading}
        errorMsg={errorMsg}
        onOpenRegister={() => setShowRegister(true)}
        autoFill={autoFill}
      />
      <RegisterModal
        open={showRegister}
        onCancel={() => setShowRegister(false)}
        onSuccess={handleRegisterSuccess}
      />
    </div>
  );
};

export default LoginPage;
