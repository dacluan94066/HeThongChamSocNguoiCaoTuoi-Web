// Trang quản lý người dùng - Danh sách, thêm/sửa/khóa tài khoản, phân quyền
import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Space, Avatar, Tooltip, Popconfirm, Button, message } from 'antd';
import {
  PlusOutlined, EditOutlined, LockOutlined, UnlockOutlined,
  UserOutlined, TeamOutlined,
} from '@ant-design/icons';
import { getUsers, createUser, updateUser, toggleUserStatus } from '../../services/userService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import ModalForm from '../../components/ModalForm';
import StatusTag, { getUserStatusMap } from '../../components/StatusTag';

const { Option } = Select;

const VAI_TRO_OPTIONS = [
  { value: 'QUAN_TRI',      label: 'Quản trị viên', color: 'purple' },
  { value: 'BAC_SI',        label: 'Bác sĩ',        color: 'blue'   },
  { value: 'Y_TA',          label: 'Y tá',           color: 'cyan'   },
  { value: 'NGUOI_CHAM_SOC',label: 'Người chăm sóc', color: 'green'  },
  { value: 'THAN_NHAN',     label: 'Thân nhân',      color: 'orange' },
];

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form] = Form.useForm();

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers({ search, vaiTro: filterRole });
      setUsers(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, [search, filterRole]);

  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record) => {
    setEditingUser(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleToggleStatus = async (id) => {
    await toggleUserStatus(id);
    message.success('Cập nhật trạng thái thành công');
    loadUsers();
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, values);
        message.success('Cập nhật người dùng thành công');
      } else {
        await createUser({ ...values, trangThai: 'HOAT_DONG', trangThaiLabel: 'Hoạt động' });
        message.success('Thêm người dùng thành công');
      }
      setModalOpen(false);
      loadUsers();
    } catch {
      message.error('Có lỗi xảy ra');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Người dùng',
      key: 'hoTen',
      render: (_, r) => (
        <Space>
          <Avatar icon={<UserOutlined />} style={{ background: '#2E7D9A' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{r.hoTen}</div>
            <div style={{ fontSize: 13, color: '#7A93A3' }}>@{r.username}</div>
          </div>
        </Space>
      ),
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Điện thoại', dataIndex: 'soDienThoai', key: 'soDienThoai' },
    {
      title: 'Vai trò',
      dataIndex: 'vaiTro',
      key: 'vaiTro',
      render: (v) => {
        const opt = VAI_TRO_OPTIONS.find((o) => o.value === v);
        return <StatusTag status="info" label={opt?.label || v} showIcon={false} />;
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'trangThai',
      key: 'trangThai',
      render: (v) => {
        const { status, label } = getUserStatusMap(v);
        return <StatusTag status={status} label={label} />;
      },
    },
    { title: 'Ngày tạo', dataIndex: 'ngayTao', key: 'ngayTao' },
    {
      title: 'Hành động',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_, r) => (
        <Space>
          <Tooltip title="Chỉnh sửa">
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} />
          </Tooltip>
          <Tooltip title={r.trangThai === 'HOAT_DONG' ? 'Khóa tài khoản' : 'Mở khóa'}>
            <Popconfirm
              title={`${r.trangThai === 'HOAT_DONG' ? 'Khóa' : 'Mở khóa'} tài khoản này?`}
              onConfirm={() => handleToggleStatus(r.id)}
              okText="Xác nhận" cancelText="Hủy"
            >
              <Button
                size="small"
                danger={r.trangThai === 'HOAT_DONG'}
                icon={r.trangThai === 'HOAT_DONG' ? <LockOutlined /> : <UnlockOutlined />}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Quản lý người dùng"
        subtitle="Danh sách tài khoản và phân quyền trong hệ thống"
        icon={<TeamOutlined />}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="large">
            Thêm người dùng
          </Button>
        }
      />

      <TableToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Tìm theo tên, username, email..."
        filters={[
          <Select
            key="role"
            placeholder="Lọc vai trò"
            style={{ width: 180 }}
            value={filterRole || undefined}
            onChange={setFilterRole}
            allowClear
          >
            {VAI_TRO_OPTIONS.map((o) => (
              <Option key={o.value} value={o.value}>{o.label}</Option>
            ))}
          </Select>,
        ]}
        count={users.length}
        countLabel="người dùng"
      />

      <DataTable
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        totalLabel="người dùng"
      />

      {/* Modal thêm/sửa */}
      <ModalForm
        title={editingUser ? 'Chỉnh sửa người dùng' : 'Thêm người dùng mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        saveLabel={editingUser ? 'Cập nhật' : 'Thêm mới'}
        form={form}
        width={520}
      >
        <Form.Item name="hoTen" label="Họ và tên" rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}>
          <Input placeholder="Nhập họ và tên" />
        </Form.Item>
        <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Vui lòng nhập username' }]}>
          <Input placeholder="Nhập username" disabled={!!editingUser} />
        </Form.Item>
        {!editingUser && (
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}>
            <Input.Password placeholder="Nhập mật khẩu" />
          </Form.Item>
        )}
        <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
          <Input placeholder="Nhập email" />
        </Form.Item>
        <Form.Item name="soDienThoai" label="Số điện thoại">
          <Input placeholder="Nhập số điện thoại" />
        </Form.Item>
        <Form.Item name="vaiTro" label="Vai trò" rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}>
          <Select placeholder="Chọn vai trò">
            {VAI_TRO_OPTIONS.map((o) => (
              <Option key={o.value} value={o.value}>{o.label}</Option>
            ))}
          </Select>
        </Form.Item>
      </ModalForm>
    </div>
  );
};

export default UsersPage;
