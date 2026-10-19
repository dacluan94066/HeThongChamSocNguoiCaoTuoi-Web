import React, { useEffect, useMemo, useState } from 'react';
import { Button, Col, Form, Input, message, Row, Space, Tag } from 'antd';
import {
  EditOutlined, EnvironmentOutlined, EyeOutlined, FileTextOutlined,
  IdcardOutlined, KeyOutlined, LinkOutlined, MailOutlined, PhoneOutlined, PlusOutlined,
  SolutionOutlined, TeamOutlined, UserDeleteOutlined, UserOutlined,
} from '@ant-design/icons';
import { createCaregiver, createCaregiverWebAccount, getCaregivers,
  resetCaregiverWebPassword, updateCaregiver } from '../../services/caregiverService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import usePermission from '../../hooks/usePermission';
import ModalForm, { FormSection } from '../../components/ModalForm';
import TableAvatar from '../../components/TableAvatar';
import TableActionButton from '../../components/TableActionButton';
import StatusTag from '../../components/StatusTag';
import { formatEntityCode } from '../../utils/displayUtils';
import RecordDetailModal from '../../components/RecordDetailModal';

const CaregiverAssignments = ({ assignments = [], compact = false }) => {
  if (!assignments.length) {
    return <span className="caregiver-unassigned">Chưa phụ trách ai</span>;
  }

  return (
    <div className={`caregiver-assignment-list ${compact ? 'is-compact' : ''}`}>
      {assignments.map((assignment) => (
        <Tag key={`${assignment.id}-${assignment.hoTen}`} className={assignment.laChinh ? 'is-primary' : ''}>
          <span>{assignment.hoTen}</span>
          {(assignment.moiQuanHe || assignment.laChinh) && (
            <small>
              {assignment.moiQuanHe || 'Người chăm sóc'}
              {assignment.laChinh ? ' • Chính' : ''}
            </small>
          )}
        </Tag>
      ))}
    </div>
  );
};

const CaregiversPage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLNGUOICHAMSOC', 'them');
  const canEdit = hasPermission('QLNGUOICHAMSOC', 'sua');
  const canCreateAccount = hasPermission('QLNGUOIDUNG', 'them');
  const canResetPassword = hasPermission('QLNGUOIDUNG', 'sua');
  const [caregivers, setCaregivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [accountTarget, setAccountTarget] = useState(null);
  const [accountMode, setAccountMode] = useState('create');
  const [accountSaving, setAccountSaving] = useState(false);
  const [form] = Form.useForm();
  const [accountForm] = Form.useForm();

  const loadCaregivers = async () => {
    try {
      setCaregivers(await getCaregivers());
    } catch {
      setCaregivers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    getCaregivers()
      .then((data) => { if (active) setCaregivers(data); })
      .catch(() => { if (active) setCaregivers([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filteredCaregivers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi');
    if (!keyword) return caregivers;
    return caregivers.filter((caregiver) => [
      caregiver.hoTen,
      caregiver.soDienThoai,
      caregiver.email,
      formatEntityCode('NCS', caregiver.id),
    ].some((value) => String(value || '').toLocaleLowerCase('vi').includes(keyword)));
  }, [caregivers, search]);

  const kpis = useMemo(() => {
    const total = caregivers.length;
    const withAccount = caregivers.filter((caregiver) => Boolean(caregiver.userId)).length;
    const unassigned = caregivers.filter((caregiver) => Number(caregiver.soNguoiPhuTrach || 0) === 0).length;
    const totalAssignments = caregivers.reduce(
      (sum, caregiver) => sum + Number(caregiver.soNguoiPhuTrach || 0),
      0,
    );
    return {
      total,
      withAccount,
      unassigned,
      average: total ? (totalAssignments / total).toFixed(1) : '0',
    };
  }, [caregivers]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      hoTen: record.hoTen,
      soDienThoai: record.soDienThoai,
      email: record.email,
      diaChi: record.diaChi,
      ngheNghiep: record.trinhDoChuyenMon,
      ghiChu: record.ghiChu,
    });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      if (editing) {
        await updateCaregiver(editing.id, values);
        message.success('Cập nhật người chăm sóc thành công');
      } else {
        await createCaregiver(values);
        message.success('Thêm người chăm sóc thành công');
      }
      setModalOpen(false);
      form.resetFields();
      await loadCaregivers();
    } finally {
      setSaving(false);
    }
  };

  const openAccountForm = (record, mode) => {
    setAccountTarget(record);
    setAccountMode(mode);
    accountForm.resetFields();
    if (mode === 'create') {
      const suggestion = String(record.email || '').split('@')[0]
        .replace(/[^A-Za-z0-9._-]/g, '').slice(0, 50);
      accountForm.setFieldsValue({ tenDangNhap: suggestion.length >= 3 ? suggestion : `ncs${record.id}` });
    }
  };

  const handleAccountSave = async (values) => {
    setAccountSaving(true);
    try {
      if (accountMode === 'create') {
        await createCaregiverWebAccount(accountTarget.id, values);
        message.success('Đã tạo tài khoản Web cho người chăm sóc');
      } else {
        await resetCaregiverWebPassword(accountTarget.id, { matKhauTam: values.matKhauTam });
        message.success('Đã đặt lại mật khẩu Web');
      }
      setAccountTarget(null);
      accountForm.resetFields();
      await loadCaregivers();
      setDetailRecord(null);
    } finally {
      setAccountSaving(false);
    }
  };

  const columns = [
    {
      title: 'Người chăm sóc',
      key: 'hoTen',
      width: 230,
      sorter: (a, b) => a.hoTen.localeCompare(b.hoTen, 'vi'),
      render: (_, record) => (
        <div className="table-person-cell caregiver-person-cell">
          <TableAvatar name={record.hoTen} size={44} />
          <div className="table-person-copy">
            <div className="table-person-name">{record.hoTen}</div>
            <div className="table-person-meta">{formatEntityCode('NCS', record.id)}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Số điện thoại',
      dataIndex: 'soDienThoai',
      key: 'soDienThoai',
      width: 145,
      render: (value) => value ? <a href={`tel:${value}`} onClick={(event) => event.stopPropagation()}>{value}</a> : '—',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 210,
      render: (value) => value ? <a href={`mailto:${value}`} onClick={(event) => event.stopPropagation()}>{value}</a> : '—',
    },
    {
      title: 'Nghề nghiệp',
      dataIndex: 'trinhDoChuyenMon',
      key: 'trinhDoChuyenMon',
      width: 165,
      render: (value) => value || 'Chưa cập nhật',
    },
    {
      title: 'Người cao tuổi phụ trách',
      dataIndex: 'phuTrach',
      key: 'phuTrach',
      width: 320,
      render: (assignments) => <CaregiverAssignments assignments={assignments} compact />,
    },
    {
      title: 'Tài khoản Web',
      dataIndex: 'userId',
      key: 'userId',
      width: 170,
      render: (userId) => (
        <StatusTag
          status={userId ? 'success' : 'inactive'}
          label={userId ? 'Có tài khoản' : 'Chưa có tài khoản'}
        />
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      fixed: 'right',
      width: 265,
      render: (_, record) => (
        <Space size={6}>
          <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setDetailRecord(record)} />
          {canEdit && (
            <TableActionButton type="edit" tooltip="Chỉnh sửa" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          )}
          {!record.userId && canCreateAccount && (
            <Button size="small" icon={<IdcardOutlined />} disabled={!record.email}
              onClick={(event) => { event.stopPropagation(); openAccountForm(record, 'create'); }}>
              Tạo tài khoản Web
            </Button>
          )}
          {record.userId && canResetPassword && (
            <Button size="small" icon={<KeyOutlined />}
              onClick={(event) => { event.stopPropagation(); openAccountForm(record, 'reset'); }}>
              Đặt lại mật khẩu
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="caregiver-management-page">
      <PageHeader
        title="Đội ngũ người chăm sóc"
        subtitle="Quản lý người được phân công chăm sóc trên Web; người cao tuổi dùng ứng dụng Mobile"
        icon={<TeamOutlined />}
        extra={canCreate && (
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={handleAdd}>
            Thêm người chăm sóc
          </Button>
        )}
      />

      <section className="caregiver-kpi-grid" aria-label="Thống kê người chăm sóc">
        <article className="caregiver-kpi-card">
          <span className="caregiver-kpi-icon"><TeamOutlined /></span>
          <div><small>Tổng người chăm sóc</small><strong>{kpis.total}</strong><p>người trong hệ thống</p></div>
        </article>
        <article className="caregiver-kpi-card is-success">
          <span className="caregiver-kpi-icon"><IdcardOutlined /></span>
          <div><small>Đã có tài khoản</small><strong>{kpis.withAccount}</strong><p>có thể đăng nhập Web</p></div>
        </article>
        <article className="caregiver-kpi-card is-warning">
          <span className="caregiver-kpi-icon"><UserDeleteOutlined /></span>
          <div><small>Chưa phụ trách ai</small><strong>{kpis.unassigned}</strong><p>chưa được phân công</p></div>
        </article>
        <article className="caregiver-kpi-card is-info">
          <span className="caregiver-kpi-icon"><LinkOutlined /></span>
          <div><small>Trung bình phụ trách</small><strong>{kpis.average}</strong><p>NCT / người chăm sóc</p></div>
        </article>
      </section>

      <section className="caregiver-list-panel">
        <div className="caregiver-list-heading">
          <div>
            <h3>Danh sách người chăm sóc</h3>
            <p>Chỉ hiển thị thông tin và phân công đang có hiệu lực trong hệ thống.</p>
          </div>
          <span>{filteredCaregivers.length} người phù hợp</span>
        </div>

        <TableToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Tìm theo tên, mã NCS hoặc số điện thoại..."
          searchWidth={380}
        />

        <DataTable
          columns={columns}
          dataSource={filteredCaregivers}
          rowKey="id"
          loading={loading}
          onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
          emptyDescription="Chưa có người chăm sóc phù hợp"
          emptyAction={canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm người chăm sóc</Button>
          )}
        />
      </section>

      <RecordDetailModal
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết người chăm sóc — ${detailRecord?.hoTen || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Mã người chăm sóc', key: 'id', render: (value) => formatEntityCode('NCS', value) },
          { label: 'Họ và tên', key: 'hoTen' },
          { label: 'Số điện thoại', key: 'soDienThoai' },
          { label: 'Email', key: 'email' },
          { label: 'Địa chỉ', key: 'diaChi', span: 2 },
          { label: 'Nghề nghiệp', key: 'trinhDoChuyenMon' },
          {
            label: 'Tài khoản Web',
            key: 'userId',
            render: (value, record) => (
              <Space wrap>
                <span>{value ? 'Đã có tài khoản' : 'Chưa có tài khoản'}</span>
                {!value && canCreateAccount && (
                  <Button size="small" disabled={!record.email}
                    onClick={() => openAccountForm(record, 'create')}>Tạo tài khoản Web</Button>
                )}
                {value && canResetPassword && (
                  <Button size="small" onClick={() => openAccountForm(record, 'reset')}>Đặt lại mật khẩu</Button>
                )}
              </Space>
            ),
          },
          {
            label: 'Người cao tuổi phụ trách',
            key: 'phuTrach',
            span: 2,
            render: (assignments) => <CaregiverAssignments assignments={assignments} />,
          },
          { label: 'Ghi chú', key: 'ghiChu', span: 2 },
        ]}
      />

      <ModalForm
        title={editing ? 'Chỉnh sửa người chăm sóc' : 'Thêm mới người chăm sóc'}
        subtitle="Lưu thông tin người được phân công chăm sóc trên Web"
        icon={<UserOutlined />}
        mode={editing ? 'edit' : 'create'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        saveLabel={editing ? 'Lưu thay đổi' : 'Lưu người chăm sóc'}
        width={820}
        form={form}
      >
        <div className="caregiver-form-overview">
          <div className="caregiver-form-code">
            <span><IdcardOutlined /></span>
            <div>
              <small>Mã người chăm sóc</small>
              <strong>{editing ? formatEntityCode('NCS', editing.id) : 'Tự động tạo sau khi lưu'}</strong>
            </div>
          </div>
          <div className="caregiver-form-account-note">
            <strong>{editing?.userId ? 'Đã có tài khoản Web' : 'Chưa có tài khoản Web'}</strong>
            <span>Thêm hồ sơ người chăm sóc không tự động tạo tài khoản đăng nhập.</span>
          </div>
        </div>

        <FormSection title="Thông tin cá nhân" description="Thông tin nhận diện và liên hệ của người chăm sóc">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="hoTen" label="Họ và tên" rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}>
                <Input prefix={<UserOutlined />} placeholder="VD: Trần Thị Mai" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="soDienThoai"
                label="Số điện thoại"
                rules={[
                  { required: true, message: 'Vui lòng nhập số điện thoại' },
                  { pattern: /^[0-9]{10,11}$/, message: 'Số điện thoại phải gồm 10–11 chữ số' },
                ]}
              >
                <Input prefix={<PhoneOutlined />} placeholder="VD: 0901234567" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Vui lòng nhập email để khôi phục mật khẩu' },
                  { type: 'email', message: 'Email không đúng định dạng' },
                ]}
              >
                <Input prefix={<MailOutlined />} placeholder="VD: nguoichamsoc@email.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="ngheNghiep" label="Nghề nghiệp">
                <Input prefix={<SolutionOutlined />} placeholder="VD: Điều dưỡng, nội trợ, nhân viên văn phòng" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="diaChi" label="Địa chỉ">
                <Input prefix={<EnvironmentOutlined />} placeholder="Nhập địa chỉ liên hệ" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item
                name="ghiChu"
                label="Ghi chú"
                rules={[{ max: 300, message: 'Ghi chú tối đa 300 ký tự' }]}
                extra={<span className="caregiver-notes-hint"><FileTextOutlined /> Tối đa 300 ký tự theo cấu trúc CSDL.</span>}
              >
                <Input.TextArea
                  autoSize={{ minRows: 3, maxRows: 6 }}
                  placeholder="Thông tin cần lưu ý về người chăm sóc"
                  className="caregiver-notes-input"
                />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>
      </ModalForm>

      <ModalForm
        title={accountMode === 'create' ? 'Tạo tài khoản Web' : 'Đặt lại mật khẩu Web'}
        subtitle={accountTarget ? `${accountTarget.hoTen} • ${accountTarget.email || 'Chưa có email'}` : ''}
        icon={<KeyOutlined />}
        mode={accountMode === 'create' ? 'create' : 'edit'}
        open={!!accountTarget}
        onCancel={() => setAccountTarget(null)}
        onFinish={handleAccountSave}
        loading={accountSaving}
        saveLabel={accountMode === 'create' ? 'Tạo tài khoản Web' : 'Đặt lại mật khẩu'}
        width={560}
        form={accountForm}
      >
        {accountMode === 'create' && (
          <Form.Item name="tenDangNhap" label="Tên đăng nhập" rules={[
            { required: true, message: 'Vui lòng nhập tên đăng nhập' },
            { pattern: /^[A-Za-z0-9._-]{3,50}$/, message: 'Dùng 3–50 ký tự chữ, số, dấu . _ -' },
          ]}>
            <Input prefix={<UserOutlined />} autoComplete="off" />
          </Form.Item>
        )}
        <Form.Item name="matKhauTam" label="Mật khẩu tạm" rules={[
          { required: true, message: 'Vui lòng nhập mật khẩu tạm' },
          { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' },
          { max: 128, message: 'Mật khẩu tối đa 128 ký tự' },
        ]}>
          <Input.Password prefix={<KeyOutlined />} autoComplete="new-password" />
        </Form.Item>
        <p>Chia sẻ mật khẩu tạm qua kênh riêng để người chăm sóc đăng nhập Web và đổi mật khẩu.</p>
      </ModalForm>
    </div>
  );
};

export default CaregiversPage;
