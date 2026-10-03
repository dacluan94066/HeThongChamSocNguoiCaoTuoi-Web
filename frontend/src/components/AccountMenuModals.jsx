import React, { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Form, Input, Modal, Table, Tag, message } from 'antd';
import dayjs from 'dayjs';
import { changeMyPassword, getLoginHistory, updateMyProfile } from '../services/authService';

const roleLabels = {
  QuanTriVien: 'Quản trị viên',
  BacSi: 'Bác sĩ / Nhân viên y tế',
  NguoiChamSoc: 'Người chăm sóc',
  NguoiCaoTuoi: 'Người cao tuổi',
};

const AccountMenuModals = ({ activeModal, onClose, user, onUserUpdated }) => {
  const [passwordForm] = Form.useForm();
  const [settingsForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (activeModal === 'settings' && user) {
      settingsForm.setFieldsValue({
        hoTen: user.hoTen,
        email: user.email,
        soDienThoai: user.soDienThoai,
      });
    }
  }, [activeModal, settingsForm, user]);

  useEffect(() => {
    if (activeModal !== 'login-history') return;

    setHistoryLoading(true);
    getLoginHistory()
      .then(setHistory)
      .finally(() => setHistoryLoading(false));
  }, [activeModal]);

  const closePasswordModal = () => {
    passwordForm.resetFields();
    onClose();
  };

  const handleChangePassword = async (values) => {
    setSubmitting(true);
    try {
      await changeMyPassword(values.matKhauHienTai, values.matKhauMoi);
      message.success('Đổi mật khẩu thành công');
      closePasswordModal();
    } catch (error) {
      if (error.response?.data?.errorCode === 'INVALID_CURRENT_PASSWORD') {
        passwordForm.setFields([
          { name: 'matKhauHienTai', errors: ['Mật khẩu hiện tại không chính xác'] },
        ]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateSettings = async (values) => {
    setSubmitting(true);
    try {
      const updatedUser = await updateMyProfile(values);
      await onUserUpdated(updatedUser);
      message.success('Cập nhật tài khoản thành công');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const historyColumns = [
    {
      title: 'Thời gian',
      dataIndex: 'thoiGianDangNhap',
      key: 'thoiGianDangNhap',
      width: 190,
      render: (value) => value ? dayjs(value).format('DD/MM/YYYY HH:mm:ss') : '—',
    },
    { title: 'Thiết bị', dataIndex: 'thietBi', key: 'thietBi', width: 120 },
    { title: 'Địa chỉ IP', dataIndex: 'diaChiIP', key: 'diaChiIP' },
    {
      title: 'Kết quả',
      dataIndex: 'ketQua',
      key: 'ketQua',
      width: 120,
      render: (value) => (
        <Tag color={value === 'ThanhCong' ? 'success' : 'error'}>
          {value === 'ThanhCong' ? 'Thành công' : 'Thất bại'}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <Modal
        title="Thông tin cá nhân"
        open={activeModal === 'profile'}
        onCancel={onClose}
        footer={<Button type="primary" onClick={onClose}>Đóng</Button>}
        width={620}
      >
        <Descriptions bordered column={1} size="middle" style={{ marginTop: 20 }}>
          <Descriptions.Item label="Họ và tên">{user?.hoTen || '—'}</Descriptions.Item>
          <Descriptions.Item label="Tên đăng nhập">{user?.tenDangNhap || '—'}</Descriptions.Item>
          <Descriptions.Item label="Vai trò">
            {roleLabels[user?.tenVaiTro] || user?.tenVaiTro || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Email">{user?.email || 'Chưa cập nhật'}</Descriptions.Item>
          <Descriptions.Item label="Số điện thoại">{user?.soDienThoai || 'Chưa cập nhật'}</Descriptions.Item>
        </Descriptions>
      </Modal>

      <Modal
        title="Đổi mật khẩu"
        open={activeModal === 'change-password'}
        onCancel={closePasswordModal}
        footer={null}
        width={520}
      >
        <Alert
          type="info"
          showIcon
          message="Mật khẩu mới cần có ít nhất 6 ký tự."
          style={{ margin: '16px 0 20px' }}
        />
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item
            name="matKhauHienTai"
            label="Mật khẩu hiện tại"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="matKhauMoi"
            label="Mật khẩu mới"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu mới' },
              { min: 6, message: 'Mật khẩu mới phải có ít nhất 6 ký tự' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="xacNhanMatKhau"
            label="Xác nhận mật khẩu mới"
            dependencies={['matKhauMoi']}
            rules={[
              { required: true, message: 'Vui lòng xác nhận mật khẩu mới' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('matKhauMoi') === value) return Promise.resolve();
                  return Promise.reject(new Error('Mật khẩu xác nhận không khớp'));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button onClick={closePasswordModal}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>Đổi mật khẩu</Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Lịch sử đăng nhập"
        open={activeModal === 'login-history'}
        onCancel={onClose}
        footer={<Button type="primary" onClick={onClose}>Đóng</Button>}
        width={760}
      >
        <Table
          style={{ marginTop: 20 }}
          columns={historyColumns}
          dataSource={history}
          rowKey="id"
          loading={historyLoading}
          pagination={{ pageSize: 6, hideOnSinglePage: true }}
          locale={{ emptyText: 'Chưa có lịch sử đăng nhập' }}
          scroll={{ x: 620 }}
        />
      </Modal>

      <Modal
        title="Cài đặt tài khoản"
        open={activeModal === 'settings'}
        onCancel={onClose}
        footer={null}
        width={560}
      >
        <Form
          form={settingsForm}
          layout="vertical"
          onFinish={handleUpdateSettings}
          style={{ marginTop: 20 }}
        >
          <Form.Item
            name="hoTen"
            label="Họ và tên"
            rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ type: 'email', message: 'Email không đúng định dạng' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="soDienThoai"
            label="Số điện thoại"
            rules={[{ pattern: /^[0-9]{10,11}$/, message: 'Số điện thoại phải gồm 10–11 chữ số' }]}
          >
            <Input />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button onClick={onClose}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>Lưu thay đổi</Button>
          </div>
        </Form>
      </Modal>
    </>
  );
};

export default AccountMenuModals;
