// Trang quản lý người dùng - Danh sách, thêm/sửa/khóa tài khoản, phân quyền
import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Space, Popconfirm, Button, message, Row, Col } from 'antd';
import {
  PlusOutlined, EditOutlined, EyeOutlined, LockOutlined, UnlockOutlined,
  UserOutlined, TeamOutlined,
} from '@ant-design/icons';
import { getUsers, createUser, updateUser, toggleUserStatus } from '../../services/userService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import ModalForm, { FormSection } from '../../components/ModalForm';
import StatusTag, { getUserStatusMap } from '../../components/StatusTag';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import TableActionButton from '../../components/TableActionButton';
import { formatEntityCode } from '../../utils/displayUtils';
import RecordDetailModal from '../../components/RecordDetailModal';

const { Option } = Select;

const VAI_TRO_OPTIONS = [
  { value: 'QUAN_TRI',      label: 'Quản trị viên', color: 'purple' },
  { value: 'BAC_SI',        label: 'Bác sĩ',        color: 'blue'   },
  { value: 'Y_TA',          label: 'Y tá',           color: 'cyan'   },
  { value: 'NGUOI_CHAM_SOC',label: 'Người chăm sóc', color: 'green'  },
  { value: 'THAN_NHAN',     label: 'Thân nhân',      color: 'orange' },
];

const UsersPage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLNGUOIDUNG', 'them');
  const canEdit = hasPermission('QLNGUOIDUNG', 'sua');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
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
      title: 'Mã người dùng',
      key: 'maNguoiDung',
      width: 135,
      render: (_, record) => <span className="entity-code-badge">{formatEntityCode('ND', record.id)}</span>,
    },
    {
      title: 'Người dùng',
      key: 'hoTen',
      sorter: (a, b) => a.hoTen.localeCompare(b.hoTen, 'vi'),
      render: (_, r) => (
        <div className="table-person-cell">
          <TableAvatar name={r.hoTen} />
          <div className="table-person-copy">
            <div className="table-person-name">{r.hoTen}</div>
            <div className="table-person-meta">@{r.username}</div>
          </div>
        </div>
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
      sorter: (a, b) => a.trangThai.localeCompare(b.trangThai),
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
      width: 132,
      render: (_, r) => (
        <Space>
          <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setDetailRecord(r)} />
          {canEdit && <TableActionButton type="edit" tooltip="Chỉnh sửa" icon={<EditOutlined />} onClick={() => handleEdit(r)} />}
          {canEdit && <Popconfirm
              title={`${r.trangThai === 'HOAT_DONG' ? 'Khóa' : 'Mở khóa'} tài khoản này?`}
              onConfirm={() => handleToggleStatus(r.id)}
              okText="Xác nhận" cancelText="Hủy"
            >
              <TableActionButton
                type={r.trangThai === 'HOAT_DONG' ? 'delete' : 'view'}
                tooltip={r.trangThai === 'HOAT_DONG' ? 'Khóa tài khoản' : 'Mở khóa'}
                icon={r.trangThai === 'HOAT_DONG' ? <LockOutlined /> : <UnlockOutlined />}
              />
          </Popconfirm>}
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
        count={users.length}
        countLabel="người dùng"
        extra={canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="large">
            Thêm người dùng
          </Button>
        )}
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
      />

      <DataTable
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
        emptyDescription="Chưa có tài khoản người dùng"
        emptyAction={canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm người dùng</Button>}
      />

      <RecordDetailModal
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết người dùng — ${detailRecord?.hoTen || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Mã người dùng', key: 'id', render: (value) => formatEntityCode('ND', value) },
          { label: 'Tên đăng nhập', key: 'username' },
          { label: 'Họ và tên', key: 'hoTen' },
          { label: 'Vai trò', key: 'vaiTro', render: (value) => VAI_TRO_OPTIONS.find((item) => item.value === value)?.label || 'Không xác định' },
          { label: 'Email', key: 'email' },
          { label: 'Số điện thoại', key: 'soDienThoai' },
          { label: 'Ngày tạo', key: 'ngayTao' },
          { label: 'Trạng thái', key: 'trangThai', render: (value) => <StatusTag {...getUserStatusMap(value)} /> },
        ]}
      />

      {/* Modal thêm/sửa */}
      <ModalForm
        title={editingUser ? 'Chỉnh sửa người dùng' : 'Thêm người dùng mới'}
        subtitle="Thiết lập thông tin tài khoản và vai trò trong hệ thống"
        icon={<UserOutlined />}
        mode={editingUser ? 'edit' : 'create'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        form={form}
      >
        <FormSection title="Thông tin tài khoản" description="Thông tin đăng nhập và phân quyền người dùng">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="hoTen" label="Họ và tên" rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}>
                <Input placeholder="VD: Nguyễn Văn An" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="vaiTro" label="Vai trò" rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}>
                <Select placeholder="Chọn vai trò trong hệ thống">
                  {VAI_TRO_OPTIONS.map((o) => (
                    <Option key={o.value} value={o.value}>{o.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }, { min: 3, message: 'Tên đăng nhập phải có ít nhất 3 ký tự' }]}>
                <Input placeholder="VD: bacsi.nguyen" disabled={!!editingUser} />
              </Form.Item>
            </Col>
            {!editingUser && (
              <Col xs={24} md={12}>
                <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }, { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' }]}>
                  <Input.Password placeholder="Tối thiểu 6 ký tự" />
                </Form.Item>
              </Col>
            )}
          </Row>
        </FormSection>

        <FormSection title="Thông tin liên hệ" description="Dùng để liên lạc và nhận thông báo từ hệ thống">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không đúng định dạng' }]}>
                <Input placeholder="VD: nguyenvana@email.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="soDienThoai" label="Số điện thoại" rules={[{ pattern: /^[0-9]{10,11}$/, message: 'Số điện thoại phải gồm 10–11 chữ số' }]}>
                <Input placeholder="VD: 0901234567" />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default UsersPage;
