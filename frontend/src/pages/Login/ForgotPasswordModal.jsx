import { useState } from 'react';
import { App, Alert, Button, Form, Input, Modal, Space, Typography } from 'antd';
import { LockOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons';

import {
  forgotPassword,
  resetPasswordWithToken,
  verifyPasswordOtp,
} from '../../services/authService';

const { Text } = Typography;

const ForgotPasswordModal = ({ open, onClose }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const closeAndReset = () => {
    setStep(0);
    setEmail('');
    setResetToken('');
    setError('');
    form.resetFields();
    onClose();
  };

  const submit = async () => {
    setError('');
    try {
      const values = await form.validateFields();
      setLoading(true);
      if (step === 0) {
        const normalizedEmail = values.email.trim().toLowerCase();
        await forgotPassword({ email: normalizedEmail });
        setEmail(normalizedEmail);
        setStep(1);
        form.setFieldsValue({ otp: '' });
        return;
      }
      if (step === 1) {
        const token = await verifyPasswordOtp({ email, otp: values.otp });
        setResetToken(token);
        setStep(2);
        form.setFieldsValue({ matKhauMoi: '', xacNhanMatKhau: '' });
        return;
      }

      await resetPasswordWithToken(resetToken, values.matKhauMoi);
      message.success('Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.');
      closeAndReset();
    } catch (err) {
      if (err?.errorFields) return;
      setError(err.response?.data?.message || err.message || 'Không thể xử lý yêu cầu.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setLoading(true);
    setError('');
    try {
      await forgotPassword({ email });
      message.success('Đã gửi lại mã OTP. Vui lòng kiểm tra email.');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không thể gửi lại mã OTP.');
    } finally {
      setLoading(false);
    }
  };

  const titles = ['Quên mật khẩu', 'Xác nhận mã OTP', 'Đặt mật khẩu mới'];

  return (
    <Modal
      open={open}
      title={titles[step]}
      onCancel={loading ? undefined : closeAndReset}
      maskClosable={!loading}
      footer={[
        step === 1 && (
          <Button key="resend" onClick={resend} disabled={loading}>
            Gửi lại mã
          </Button>
        ),
        <Button key="submit" type="primary" loading={loading} onClick={submit}>
          {step === 0 ? 'Gửi mã OTP' : step === 1 ? 'Xác nhận' : 'Đổi mật khẩu'}
        </Button>,
      ].filter(Boolean)}
      destroyOnHidden
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {error && <Alert type="error" showIcon message={error} />}
        <Text type="secondary">
          {step === 0 && 'Nhập email đã đăng ký. Mã OTP 6 số sẽ có hiệu lực trong 10 phút.'}
          {step === 1 && `Mã xác nhận đã được gửi tới ${email}.`}
          {step === 2 && 'Mật khẩu mới phải có ít nhất 6 ký tự.'}
        </Text>
        <Form form={form} layout="vertical" onFinish={submit}>
          {step === 0 && (
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: 'Vui lòng nhập email' },
                { type: 'email', message: 'Email không hợp lệ' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="vidu@gmail.com" autoComplete="email" />
            </Form.Item>
          )}
          {step === 1 && (
            <Form.Item
              name="otp"
              label="Mã OTP"
              rules={[
                { required: true, message: 'Vui lòng nhập mã OTP' },
                { pattern: /^\d{6}$/, message: 'Mã OTP phải gồm đúng 6 chữ số' },
              ]}
            >
              <Input
                prefix={<SafetyOutlined />}
                maxLength={6}
                inputMode="numeric"
                placeholder="000000"
                autoComplete="one-time-code"
              />
            </Form.Item>
          )}
          {step === 2 && (
            <>
              <Form.Item
                name="matKhauMoi"
                label="Mật khẩu mới"
                rules={[
                  { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                  { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' },
                ]}
              >
                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="xacNhanMatKhau"
                label="Xác nhận mật khẩu"
                dependencies={['matKhauMoi']}
                rules={[
                  { required: true, message: 'Vui lòng xác nhận mật khẩu' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      return !value || getFieldValue('matKhauMoi') === value
                        ? Promise.resolve()
                        : Promise.reject(new Error('Xác nhận mật khẩu không khớp'));
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
              </Form.Item>
            </>
          )}
        </Form>
      </Space>
    </Modal>
  );
};

export default ForgotPasswordModal;
