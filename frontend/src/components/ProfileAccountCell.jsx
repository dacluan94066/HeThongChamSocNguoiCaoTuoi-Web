import React, { useState } from 'react';
import { Alert, Button, Form, Input, Modal, Space, Tag, Tooltip, message } from 'antd';
import { useAuth } from '../context/AuthContext';
import ModalForm, { FormSection } from './ModalForm';
import { createProfileUser } from '../services/accountProfileService';

// undefined means the API omitted the field; it must never be treated as NULL.
const profileUserId = (record) => (
  Object.hasOwn(record, 'userId') ? record.userId : record.UserID
);

const errorTitles = {
  400: 'Dữ liệu không hợp lệ',
  403: 'Bạn không có quyền quản trị liên kết tài khoản',
  404: 'Không tìm thấy hồ sơ hoặc tài khoản',
  409: 'Không thể liên kết: hồ sơ, tài khoản hoặc thông tin đăng nhập đã được sử dụng',
};

export default function ProfileAccountCell({ record, kind, onRefresh }) {
  const { user } = useAuth();
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [createdUserId, setCreatedUserId] = useState(undefined);
  const [form] = Form.useForm();
  const userId = profileUserId(record) ?? createdUserId;
  const known = profileUserId(record) !== undefined || createdUserId !== undefined;
  const linked = known && userId != null;
  const admin = user?.tenVaiTro === 'QuanTriVien';
  const mock = kind === 'elderly' && import.meta.env.VITE_USE_MOCK === 'true';
  const disabled = !known || mock;

  const openCreate = () => {
    form.resetFields();
    setError(null);
    setMode('create');
  };

  const create = async (values) => {
    if (saving || !admin || disabled || linked) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createProfileUser(kind, record.id, values);
      setCreatedUserId(result.userId);
      setMode(null);
      form.resetFields();
      message.success('Đã tạo tài khoản và liên kết với hồ sơ');
      try {
        await onRefresh();
      } catch {
        message.warning('Đã liên kết thành công nhưng chưa tải lại được bảng. Vui lòng tải lại danh sách.');
      }
    } catch (err) {
      const status = err.response?.status;
      setError([errorTitles[status] || 'Không thể tạo tài khoản', err.response?.data?.message || err.message].join('. '));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Space orientation="vertical" size={6}>
        <Tag color={linked ? 'green' : known ? 'orange' : 'default'}>
          {linked ? 'Đã liên kết' : known ? 'Chưa liên kết tài khoản' : 'Chưa xác định liên kết'}
        </Tag>
        {linked && <span>{record.username || record.tenDangNhap || `UserID: ${userId}`}</span>}
        {admin && !linked && (
          <Tooltip title={mock ? 'Chức năng chỉ dùng với dữ liệu API thật' : !known ? 'API hồ sơ chưa trả userId; chưa thể xác định trạng thái liên kết' : undefined}>
            <Space wrap size={4}>
              <Button size="small" disabled={disabled} onClick={() => setMode('link')}>Liên kết tài khoản</Button>
              <Button size="small" disabled={disabled} onClick={openCreate}>Tạo tài khoản</Button>
            </Space>
          </Tooltip>
        )}
      </Space>
      <Modal title="Liên kết tài khoản" open={mode === 'link'} onCancel={() => setMode(null)}
        footer={<Button onClick={() => setMode(null)}>Đóng</Button>} centered>
        <Alert type="info" showIcon title="Chưa có danh sách tài khoản đủ điều kiện"
          description="Backend hiện chưa có API lấy tài khoản hoạt động, đúng vai trò và chưa liên kết ở cả hai loại hồ sơ. Chức năng chọn và gửi liên kết đang chờ API này." />
      </Modal>
      <ModalForm title="Tạo tài khoản" subtitle={`Hồ sơ: ${record.hoTen}`} open={mode === 'create'}
        onCancel={() => setMode(null)} onFinish={create} loading={saving} form={form}
        saveLabel="Tạo tài khoản và liên kết" width={560}>
        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
        <FormSection title="Thông tin đăng nhập" description="Vai trò do backend xác định theo loại hồ sơ.">
          <Form.Item name="username" label="Tên đăng nhập" normalize={(value) => value.trim()}
            rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' },
              { pattern: /^[a-zA-Z0-9_.-]{3,50}$/, message: 'Dùng 3–50 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang' }]}>
            <Input autoComplete="off" maxLength={50} />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' },
            { min: 6, max: 72, message: 'Mật khẩu cần 6–72 ký tự' }]}>
            <Input.Password autoComplete="new-password" maxLength={72} />
          </Form.Item>
          <Form.Item name="email" label="Email (tùy chọn)" rules={[{ type: 'email', message: 'Email không đúng định dạng' }, { max: 100 }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="soDienThoai" label="Số điện thoại (tùy chọn)" rules={[{ max: 15, message: 'Tối đa 15 ký tự' }]}>
            <Input maxLength={15} />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
}
