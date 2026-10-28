import { useRef, useState } from 'react';
import { Alert, Button, Col, DatePicker, Form, Input, Modal, Radio, Row, Select } from 'antd';
import { HeartOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { registerWebAccount } from '../../services/authService';
import { PUBLIC_REGISTRATION_ROLES } from '../../utils/publicRegistration';
import { mobilePasswordRules } from '../../utils/accountFormRules';
import { vietnamAlertParts } from '../../utils/alertTime';
import './Registration.css';

const CaregiverRegistrationModal = ({ open, onClose }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registered, setRegistered] = useState(null);
  const pending = useRef(false);
  const selectedRole = Form.useWatch('loaiTaiKhoan', form);
  const role = PUBLIC_REGISTRATION_ROLES.find(item => item.value === selectedRole);
  const elderly = selectedRole === 'NguoiCaoTuoi';
  const caregiver = selectedRole === 'NguoiChamSoc';

  const close = () => {
    if (pending.current) return;
    form.resetFields();
    setError('');
    setRegistered(null);
    onClose();
  };

  const submit = async (values) => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      const registeredRole = await registerWebAccount(values);
      form.resetFields();
      setRegistered(registeredRole);
    } catch (err) {
      setError(err.response?.data?.message || (err.config && !err.response
        ? 'Chưa xác định được kết quả đăng ký do mất kết nối. Hệ thống không tự gửi lại. Bạn có thể thử đăng nhập hoặc kiểm tra trước khi đăng ký lại.'
        : err.message || 'Không thể đăng ký. Vui lòng thử lại.'));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  return (
    <Modal
      title={<div className="account-registration-heading"><span aria-hidden="true"><HeartOutlined /></span><div><h2>Tạo tài khoản CareSenior</h2><p>Chọn vai trò phù hợp để bắt đầu</p></div></div>}
      open={open}
      onCancel={close}
      footer={null}
      width={780}
      centered
      className="account-registration-modal"
      mask={{ closable: !loading }}
      keyboard={!loading}
      closable={!loading}
    >
      {registered ? (
        <div className="account-registration-result">
          <Alert
            type="success"
            showIcon
            title={registered.value === 'NguoiChamSoc' ? 'Đã gửi yêu cầu đăng ký Người chăm sóc' : `Đăng ký ${registered.label} thành công`}
            description={registered.success}
          />
          <Button type="primary" onClick={close}>Quay lại đăng nhập</Button>
        </div>
      ) : (
        <>
          {error && <Alert type="error" showIcon title={error} className="account-registration-error" />}
          <Form form={form} layout="vertical" size="large" onFinish={submit} autoComplete="off" disabled={loading}>
            <Form.Item name="loaiTaiKhoan" label="Bạn đăng ký với vai trò nào?" rules={[{ required: true, message: 'Vui lòng chọn loại tài khoản' }]}>
              <Radio.Group aria-label="Loại tài khoản" className="account-registration-roles" onChange={() => {
                form.resetFields(['ngaySinh', 'gioiTinh']); setError('');
              }}>
                {PUBLIC_REGISTRATION_ROLES.map(item => <Radio.Button key={item.value} value={item.value}>
                  <span className="account-registration-role-icon" aria-hidden="true">{item.value === 'NguoiCaoTuoi' ? <UserOutlined /> : item.value === 'NguoiChamSoc' ? <HeartOutlined /> : <TeamOutlined />}</span>
                  <strong>{item.label}</strong><small>{item.detail}</small>
                </Radio.Button>)}
              </Radio.Group>
            </Form.Item>
            {role && <p className="account-registration-note">{role.note}</p>}
            <Row gutter={18}><Col xs={24} sm={12}>
            <Form.Item name="hoTen" label="Họ và tên" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập họ tên' }, { max: 100, message: 'Tối đa 100 ký tự' }]}>
              <Input maxLength={100} autoComplete="name" />
            </Form.Item>
            </Col><Col xs={24} sm={12}>
            <Form.Item name="tenDangNhap" label="Tên đăng nhập" rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }, { pattern: /^[A-Za-z0-9._-]{3,50}$/, message: 'Dùng 3–50 chữ, số hoặc dấu . _ -' }]}>
              <Input maxLength={50} autoComplete="username" />
            </Form.Item>
            </Col><Col xs={24} sm={12}>
            <Form.Item name="email" label="Email (dùng để quên mật khẩu)" rules={[{ required: true, message: 'Vui lòng nhập email' }, { type: 'email', message: 'Email không hợp lệ' }, { max: 100, message: 'Tối đa 100 ký tự' }]}>
              <Input maxLength={100} autoComplete="email" inputMode="email" />
            </Form.Item>
            </Col><Col xs={24} sm={12}>
            <Form.Item name="soDienThoai" label="Số điện thoại đăng nhập" rules={[{ required: caregiver, message: 'Vui lòng nhập số điện thoại người chăm sóc' }, { pattern: caregiver ? /^0\d{9,10}$/ : /^0\d{9}$/, message: caregiver ? 'Số điện thoại phải có 10–11 chữ số, bắt đầu bằng 0' : 'Số điện thoại phải có 10 chữ số, bắt đầu bằng 0' }]}>
              <Input maxLength={caregiver ? 11 : 10} autoComplete="tel" inputMode="tel" placeholder={caregiver ? 'Bắt buộc với người chăm sóc' : 'Không bắt buộc'} />
            </Form.Item>
            </Col><Col xs={24} sm={12}>
            <Form.Item name="matKhau" label="Mật khẩu" rules={mobilePasswordRules}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            </Col><Col xs={24} sm={12}>
            <Form.Item name="xacNhanMatKhau" label="Xác nhận mật khẩu" dependencies={['matKhau']} rules={[{ required: true, message: 'Vui lòng xác nhận mật khẩu' }, ({ getFieldValue }) => ({ validator(_, value) { return value === getFieldValue('matKhau') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu xác nhận không khớp')); } })]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            </Col></Row>
            {elderly && <section className="account-registration-profile">
              <h3>Hồ sơ cá nhân của Người cao tuổi</h3>
              <p>Hồ sơ được tạo cùng tài khoản, dùng chung trên Web và Mobile. Bạn có thể bổ sung thông tin khác sau khi đăng nhập.</p>
              <Row gutter={18}><Col xs={24} sm={12}>
                <Form.Item name="ngaySinh" preserve={false} label="Ngày sinh" rules={[{ required: true, message: 'Vui lòng chọn ngày sinh' },
                  { validator: (_, value) => !value || value.isValid() && value.format('YYYY-MM-DD') <= vietnamAlertParts(new Date().toISOString()).dayKey
                    ? Promise.resolve() : Promise.reject(new Error('Ngày sinh không hợp lệ hoặc ở tương lai')) }]}>
                  <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày sinh" style={{ width: '100%' }}
                    disabledDate={value => value && value.format('YYYY-MM-DD') > vietnamAlertParts(new Date().toISOString()).dayKey} />
                </Form.Item>
              </Col><Col xs={24} sm={12}>
                <Form.Item name="gioiTinh" preserve={false} label="Giới tính" rules={[{ required: true, message: 'Vui lòng chọn giới tính' }]}>
                  <Select placeholder="Chọn giới tính" options={['Nam', 'Nữ', 'Khác'].map(value => ({ value, label: value }))} />
                </Form.Item>
              </Col></Row>
            </section>}
            <p className="account-registration-security">Đăng ký không tự cấp quyền quản trị hoặc quyền xem hồ sơ của người khác.</p>
            <Button type="primary" htmlType="submit" block loading={loading}>Tạo tài khoản</Button>
          </Form>
        </>
      )}
    </Modal>
  );
};

export default CaregiverRegistrationModal;
