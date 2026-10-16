import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Checkbox, Col, Form, Input, message, Popconfirm, Row, Select, Tabs,
} from 'antd';
import {
  EditOutlined, EyeOutlined, LockOutlined, SafetyCertificateOutlined, SaveOutlined,
  SearchOutlined, TeamOutlined, UnlockOutlined, UserAddOutlined, UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { createUser, getUsers, toggleUserStatus, updateUser } from '../../services/userService';
import { getPermissionMatrix, updatePermissionMatrix } from '../../services/permissionService';
import DataTable from '../../components/DataTable';
import ModalForm, { FormSection } from '../../components/ModalForm';
import StatusTag, { getUserStatusMap } from '../../components/StatusTag';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import TableActionButton from '../../components/TableActionButton';
import RecordDetailModal from '../../components/RecordDetailModal';

const ROLE_OPTIONS = [
  { value: 'QUAN_TRI', name: 'QuanTriVien', label: 'Quản trị viên', tone: 'admin' },
  { value: 'BAC_SI', name: 'BacSi', label: 'Bác sĩ', tone: 'doctor' },
  { value: 'NGUOI_CHAM_SOC', name: 'NguoiChamSoc', label: 'Người chăm sóc', tone: 'caregiver' },
  { value: 'NGUOI_CAO_TUOI', name: 'NguoiCaoTuoi', label: 'Người cao tuổi', tone: 'elderly' },
];

const STATUS_OPTIONS = [
  { value: 'HOAT_DONG', label: 'Hoạt động' },
  { value: 'KHOA', label: 'Khóa' },
  { value: 'CHO_DUYET', label: 'Chờ duyệt' },
];

const PERMISSION_ACTIONS = [
  { key: 'xem', label: 'Xem' },
  { key: 'them', label: 'Thêm' },
  { key: 'sua', label: 'Sửa' },
  { key: 'xoa', label: 'Xóa' },
];

const roleMeta = (value) => ROLE_OPTIONS.find((role) => (
  role.value === value || role.name === value
)) || { label: value || 'Không xác định', tone: 'default' };

const formatRelativeTime = (value) => {
  if (!value || !dayjs(value).isValid()) return 'Chưa đăng nhập';
  const loggedAt = dayjs(value);
  const minutes = Math.max(0, dayjs().diff(loggedAt, 'minute'));
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = dayjs().diff(loggedAt, 'hour');
  if (hours < 24) return `${hours} giờ trước`;
  const days = dayjs().diff(loggedAt, 'day');
  if (days < 7) return `${days} ngày trước`;
  return loggedAt.format('DD/MM/YYYY HH:mm');
};

const buildPermissionValues = (data) => {
  const values = {};
  data.roles.forEach((role) => {
    data.functions.forEach((feature) => {
      const entry = data.permissions.find((item) => (
        Number(item.vaiTroId) === Number(role.id)
        && Number(item.chucNangId) === Number(feature.id)
      ));
      values[`${role.id}:${feature.id}`] = {
        xem: Boolean(entry?.xem),
        them: Boolean(entry?.them),
        sua: Boolean(entry?.sua),
        xoa: Boolean(entry?.xoa),
      };
    });
  });
  return values;
};

const UsersPage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLNGUOIDUNG', 'them');
  const canEdit = hasPermission('QLNGUOIDUNG', 'sua');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [matrixData, setMatrixData] = useState({ roles: [], functions: [], permissions: [] });
  const [permissionValues, setPermissionValues] = useState({});
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [activeTab, setActiveTab] = useState('users');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();

  const loadUsers = async () => {
    setLoading(true);
    try {
      setUsers(await getUsers());
    } finally {
      setLoading(false);
    }
  };

  const loadMatrix = async () => {
    setMatrixLoading(true);
    try {
      const data = await getPermissionMatrix();
      setMatrixData(data);
      setPermissionValues(buildPermissionValues(data));
    } finally {
      setMatrixLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    getUsers()
      .then((data) => { if (active) setUsers(data); })
      .catch(() => { if (active) setUsers([]); })
      .finally(() => { if (active) setLoading(false); });
    getPermissionMatrix()
      .then((data) => {
        if (!active) return;
        setMatrixData(data);
        setPermissionValues(buildPermissionValues(data));
      })
      .catch(() => {
        if (active) setMatrixData({ roles: [], functions: [], permissions: [] });
      })
      .finally(() => { if (active) setMatrixLoading(false); });
    return () => { active = false; };
  }, []);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi');
    return users.filter((user) => {
      const matchesKeyword = !keyword || [user.username, user.hoTen, user.email, user.soDienThoai]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('vi').includes(keyword));
      return matchesKeyword
        && (!filterRole || user.vaiTro === filterRole)
        && (!filterStatus || user.trangThai === filterStatus);
    });
  }, [filterRole, filterStatus, search, users]);

  const kpis = useMemo(() => [
    { key: 'total', label: 'Tổng tài khoản', value: users.length, icon: <TeamOutlined />, tone: 'total' },
    ...ROLE_OPTIONS.map((role) => ({
      key: role.value,
      label: role.label,
      value: users.filter((user) => user.vaiTro === role.value).length,
      icon: <UserOutlined />,
      tone: role.tone,
    })),
    {
      key: 'locked',
      label: 'Tài khoản bị khóa',
      value: users.filter((user) => user.trangThai === 'KHOA').length,
      icon: <LockOutlined />,
      tone: 'locked',
    },
  ], [users]);

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

  const handleToggleStatus = async (record) => {
    await toggleUserStatus(record.id);
    message.success(record.trangThai === 'HOAT_DONG'
      ? 'Đã khóa tài khoản'
      : 'Đã kích hoạt tài khoản');
    await loadUsers();
  };

  const handleSaveUser = async (values) => {
    setSaving(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, values);
        message.success('Cập nhật người dùng thành công');
      } else {
        await createUser(values);
        message.success('Thêm người dùng thành công');
      }
      setModalOpen(false);
      form.resetFields();
      await loadUsers();
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (roleId, functionId, action, checked) => {
    const key = `${roleId}:${functionId}`;
    setPermissionValues((current) => ({
      ...current,
      [key]: { ...current[key], [action]: checked },
    }));
  };

  const handleSaveMatrix = async () => {
    const permissions = matrixData.roles.flatMap((role) => (
      matrixData.functions.map((feature) => ({
        vaiTroId: role.id,
        chucNangId: feature.id,
        ...permissionValues[`${role.id}:${feature.id}`],
      }))
    ));
    setMatrixSaving(true);
    try {
      await updatePermissionMatrix(permissions);
      message.success('Đã lưu ma trận phân quyền');
      await loadMatrix();
    } finally {
      setMatrixSaving(false);
    }
  };

  const userColumns = [
    {
      title: 'Tên đăng nhập', dataIndex: 'username', key: 'username', width: 150,
      render: (value) => <strong className="user-account-name">{value}</strong>,
    },
    {
      title: 'Họ tên & liên hệ', key: 'identity', width: 290,
      render: (_, record) => (
        <div className="user-identity-cell">
          <TableAvatar name={record.hoTen} size={42} />
          <div>
            <strong>{record.hoTen}</strong>
            <span>{[record.email, record.soDienThoai].filter(Boolean).join(' · ') || 'Chưa cập nhật liên hệ'}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Vai trò', dataIndex: 'vaiTro', key: 'vaiTro', width: 155,
      render: (value) => {
        const role = roleMeta(value);
        return <span className={`user-role-tag is-${role.tone}`}><i />{role.label}</span>;
      },
    },
    {
      title: 'Trạng thái', dataIndex: 'trangThai', key: 'trangThai', width: 130,
      render: (value) => <StatusTag {...getUserStatusMap(value)} size="small" />,
    },
    {
      title: 'Lần đăng nhập cuối', dataIndex: 'lanDangNhapCuoi', key: 'lanDangNhapCuoi', width: 155,
      render: (value) => <span className="last-login-time">{formatRelativeTime(value)}</span>,
    },
    {
      title: 'Thao tác', key: 'actions', fixed: 'right', width: 112,
      render: (_, record) => (
        <div className="user-table-actions">
          <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setDetailRecord(record)} />
          {canEdit && <TableActionButton type="edit" tooltip="Chỉnh sửa" icon={<EditOutlined />} onClick={() => handleEdit(record)} />}
          {canEdit && (
            <Popconfirm
              title={record.trangThai === 'HOAT_DONG' ? 'Khóa tài khoản này?' : 'Kích hoạt tài khoản này?'}
              onConfirm={() => handleToggleStatus(record)}
              okText="Xác nhận"
              cancelText="Hủy"
            >
              <TableActionButton
                type={record.trangThai === 'HOAT_DONG' ? 'delete' : 'view'}
                tooltip={record.trangThai === 'HOAT_DONG' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                icon={record.trangThai === 'HOAT_DONG' ? <LockOutlined /> : <UnlockOutlined />}
              />
            </Popconfirm>
          )}
          {!canEdit && <span>—</span>}
        </div>
      ),
    },
  ];

  const permissionColumns = [
    {
      title: 'Chức năng hệ thống', key: 'function', fixed: 'left', width: 230,
      render: (_, feature, index) => (
        <div className="permission-feature-cell">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <div><strong>{feature.tenChucNang}</strong><small>{feature.maChucNang}</small></div>
        </div>
      ),
    },
    ...matrixData.roles.map((role) => ({
      title: roleMeta(role.tenVaiTro).label,
      key: String(role.id),
      width: 245,
      render: (_, feature) => {
        const values = permissionValues[`${role.id}:${feature.id}`] || {};
        return (
          <div className="permission-checkboxes">
            {PERMISSION_ACTIONS.map((action) => (
              <Checkbox
                key={action.key}
                checked={Boolean(values[action.key])}
                disabled={!canEdit}
                onChange={(event) => togglePermission(role.id, feature.id, action.key, event.target.checked)}
              >
                {action.label}
              </Checkbox>
            ))}
          </div>
        );
      },
    })),
  ];

  const usersTab = (
    <div className="users-tab-content">
      <div className="users-filter-bar">
        <Input allowClear prefix={<SearchOutlined />} value={search} placeholder="Tìm tên đăng nhập, họ tên, email, SĐT..." onChange={(event) => setSearch(event.target.value)} />
        <Select allowClear value={filterRole || undefined} placeholder="Tất cả vai trò" onChange={(value) => setFilterRole(value || '')} options={ROLE_OPTIONS.map(({ value, label }) => ({ value, label }))} />
        <Select allowClear value={filterStatus || undefined} placeholder="Tất cả trạng thái" onChange={(value) => setFilterStatus(value || '')} options={STATUS_OPTIONS} />
        {canCreate && <Button type="primary" icon={<UserAddOutlined />} onClick={handleAdd}>Thêm tài khoản</Button>}
      </div>
      <DataTable columns={userColumns} dataSource={filteredUsers} rowKey="id" loading={loading} pageSize={10} emptyDescription="Không có tài khoản phù hợp" />
    </div>
  );

  const permissionsTab = (
    <div className="permission-matrix-panel">
      <header>
        <div>
          <span><SafetyCertificateOutlined /></span>
          <div>
            <h2>Ma trận phân quyền 4 vai trò × {matrixData.functions.length} chức năng</h2>
            <p>Dữ liệu vai trò, chức năng và quyền được đọc trực tiếp từ hệ thống.</p>
          </div>
        </div>
        {canEdit && <Button type="primary" icon={<SaveOutlined />} loading={matrixSaving} onClick={handleSaveMatrix}>Lưu phân quyền</Button>}
      </header>
      <DataTable className="permission-matrix-table" columns={permissionColumns} dataSource={matrixData.functions} rowKey="id" loading={matrixLoading} pagination={false} emptyDescription="Chưa có danh mục chức năng" />
    </div>
  );

  return (
    <div className="users-permissions-page">
      <section className="users-page-heading">
        <div>
          <span className="users-page-eyebrow"><span /> Hệ thống · Quản lý truy cập</span>
          <h1>Quản lý Tài khoản & Phân quyền</h1>
          <p>Quản lý tài khoản người dùng và quyền thao tác theo vai trò trong hệ thống.</p>
        </div>
        {canCreate && activeTab === 'users' && <Button type="primary" size="large" icon={<UserAddOutlined />} onClick={handleAdd}>Tạo tài khoản mới</Button>}
      </section>

      <section className="user-kpi-grid">
        {kpis.map((item) => (
          <article className={`user-kpi-card is-${item.tone}`} key={item.key}>
            <span>{item.icon}</span>
            <div><small>{item.label}</small><strong>{item.value}</strong></div>
          </article>
        ))}
      </section>

      <section className="users-workspace-card">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'users', label: <span><TeamOutlined /> Người dùng <b>{users.length}</b></span>, children: usersTab },
            { key: 'permissions', label: <span><SafetyCertificateOutlined /> Phân quyền <b>{matrixData.functions.length}</b></span>, children: permissionsTab },
          ]}
        />
      </section>

      <RecordDetailModal
        open={Boolean(detailRecord)}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết người dùng — ${detailRecord?.hoTen || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Tên đăng nhập', key: 'username' },
          { label: 'Họ và tên', key: 'hoTen' },
          { label: 'Vai trò', key: 'vaiTro', render: (value) => roleMeta(value).label },
          { label: 'Trạng thái', key: 'trangThai', render: (value) => <StatusTag {...getUserStatusMap(value)} /> },
          { label: 'Email', key: 'email' },
          { label: 'Số điện thoại', key: 'soDienThoai' },
          { label: 'Ngày tạo', key: 'ngayTao' },
          { label: 'Lần đăng nhập cuối', key: 'lanDangNhapCuoi', render: formatRelativeTime },
        ]}
      />

      <ModalForm
        title={editingUser ? 'Chỉnh sửa người dùng' : 'Thêm người dùng mới'}
        subtitle="Thiết lập thông tin tài khoản và vai trò trong hệ thống"
        icon={<UserOutlined />}
        mode={editingUser ? 'edit' : 'create'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSaveUser}
        loading={saving}
        form={form}
      >
        <FormSection title="Thông tin tài khoản" description="Thông tin đăng nhập và vai trò người dùng">
          <Row gutter={18}>
            <Col xs={24} md={12}><Form.Item name="hoTen" label="Họ và tên" rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}><Input placeholder="VD: Nguyễn Văn An" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="vaiTro" label="Vai trò" rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}><Select placeholder="Chọn vai trò" options={ROLE_OPTIONS.map(({ value, label }) => ({ value, label }))} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }, { min: 3, message: 'Tên đăng nhập phải có ít nhất 3 ký tự' }]}><Input placeholder="VD: bacsi.nguyen" disabled={Boolean(editingUser)} /></Form.Item></Col>
            {!editingUser && <Col xs={24} md={12}><Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }, { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' }]}><Input.Password placeholder="Tối thiểu 6 ký tự" /></Form.Item></Col>}
          </Row>
        </FormSection>
        <FormSection title="Thông tin liên hệ" description="Email và số điện thoại của tài khoản">
          <Row gutter={18}>
            <Col xs={24} md={12}><Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không đúng định dạng' }]}><Input placeholder="VD: nguoidung@email.com" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="soDienThoai" label="Số điện thoại" rules={[{ pattern: /^[0-9]{10,11}$/, message: 'Số điện thoại phải gồm 10–11 chữ số' }]}><Input placeholder="VD: 0901234567" /></Form.Item></Col>
          </Row>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default UsersPage;
