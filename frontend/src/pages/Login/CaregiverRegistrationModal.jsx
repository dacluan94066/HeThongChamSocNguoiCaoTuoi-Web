import { useState } from 'react';
import { Alert, Button, Form, Input, Modal } from 'antd';
import { registerCaregiver } from '../../services/authService';

const CaregiverRegistrationModal = ({ open, onClose }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(false);

  const close = () => {
    if (loading) return;
    form.resetFields();
    setError('');
    setRegistered(false);
    onClose();
  };

  const submit = async (values) => {
    setLoading(true);
    setError('');
    try {
      await registerCaregiver({
        tenDangNhap: values.tenDangNhap.trim(),
        matKhau: values.matKhau,
        hoTen: values.hoTen.trim(),
        email: values.email.trim().toLowerCase(),
        soDienThoai: values.soDienThoai.trim(),
      });
      form.resetFields();
      setRegistered(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể đăng ký. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Đăng ký người chăm sóc"
      open={open}
      onCancel={close}
      footer={null}
      width={540}
      maskClosable={!loading}
      closable={!loading}
    >
      {registered ? (
        <div className="caregiver-registration-result">
          <Alert
            type="success"
            showIcon
            message="Đăng ký thành công"
            description="Tài khoản đang chờ quản trị viên kiểm tra và duyệt. Sau khi được duyệt và phân công người cao tuổi phụ trách, bạn có thể đăng nhập trên Web."
          />
          <Button type="primary" onClick={close}>Quay lại đăng nhập</Button>
        </div>
      ) : (
        <>
          <p className="caregiver-registration-note">
            Dành cho người chăm sóc sử dụng Web. Quản trị viên sẽ duyệt tài khoản và phân công người cao tuổi phụ trách.
          </p>
          {error && <Alert type="error" showIcon message={error} className="caregiver-registration-error" />}
          <Form form={form} layout="vertical" onFinish={submit} autoComplete="off">
            <Form.Item name="hoTen" label="Họ và tên" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập họ tên' }, { max: 100, message: 'Tối đa 100 ký tự' }]}>
              <Input maxLength={100} autoComplete="name" />
            </Form.Item>
            <Form.Item name="tenDangNhap" label="Tên đăng nhập" rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }, { pattern: /^[A-Za-z0-9._-]{3,50}$/, message: 'Dùng 3–50 chữ, số hoặc dấu . _ -' }]}>
              <Input maxLength={50} autoComplete="username" />
            </Form.Item>
            <Form.Item name="email" label="Email (dùng để quên mật khẩu)" rules={[{ required: true, message: 'Vui lòng nhập email' }, { type: 'email', message: 'Email không hợp lệ' }, { max: 100, message: 'Tối đa 100 ký tự' }]}>
              <Input maxLength={100} autoComplete="email" />
            </Form.Item>
            <Form.Item name="soDienThoai" label="Số điện thoại" rules={[{ required: true, message: 'Vui lòng nhập số điện thoại' }, { pattern: /^0\d{9,10}$/, message: 'Số điện thoại phải có 10–11 chữ số, bắt đầu bằng 0' }]}>
              <Input maxLength={11} autoComplete="tel" />
            </Form.Item>
            <Form.Item name="matKhau" label="Mật khẩu" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }, { min: 6, message: 'Tối thiểu 6 ký tự' }, { max: 128, message: 'Tối đa 128 ký tự' }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item name="xacNhanMatKhau" label="Xác nhận mật khẩu" dependencies={['matKhau']} rules={[{ required: true, message: 'Vui lòng xác nhận mật khẩu' }, ({ getFieldValue }) => ({ validator(_, value) { return value === getFieldValue('matKhau') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu xác nhận không khớp')); } })]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>Tạo tài khoản</Button>
          </Form>
        </>
      )}
    </Modal>
  );
};

export default CaregiverRegistrationModal;
