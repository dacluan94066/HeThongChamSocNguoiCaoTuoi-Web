// Trang quản lý người chăm sóc - Danh sách và phân công
import React, { useState, useEffect } from 'react';
import { Space, Tag, Button, Row, Col, Card, Form, Input, message } from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { getCaregivers, createCaregiver, updateCaregiver } from '../../services/caregiverService';
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
import ProfileAccountCell from '../../components/ProfileAccountCell';

const CaregiversPage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLNGUOICHAMSOC', 'them');
  const canEdit = hasPermission('QLNGUOICHAMSOC', 'sua');
  const [caregivers, setCaregivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();

  const loadCaregivers = async () => {
    setLoading(true);
    try {
      setCaregivers(await getCaregivers({ search }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    getCaregivers({ search }).then(setCaregivers).finally(() => setLoading(false));
  }, [search]);

  const totalPhuTrach = caregivers.reduce((sum, c) => sum + (c.soNguoiPhuTrach || 0), 0);

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
      getCaregivers({ search }).then(setCaregivers);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Tài khoản',
      key: 'account',
      width: 260,
      render: (_, record) => <ProfileAccountCell key={record.id} record={record} kind="caregiver" onRefresh={loadCaregivers} />,
    },
    {
      title: 'Nhân viên',
      key: 'hoTen',
      sorter: (a, b) => a.hoTen.localeCompare(b.hoTen, 'vi'),
      render: (_, r) => (
        <div className="table-person-cell">
          <TableAvatar name={r.hoTen} />
          <div className="table-person-copy">
            <div className="table-person-name">{r.hoTen}</div>
            <div className="table-person-meta">{formatEntityCode('NCS', r.id)}</div>
          </div>
        </div>
      ),
    },
    { title: 'Điện thoại', dataIndex: 'soDienThoai', key: 'soDienThoai' },
    { title: 'Trình độ', dataIndex: 'trinhDoChuyenMon', key: 'trinhDoChuyenMon' },
    {
      title: 'Kinh nghiệm',
      dataIndex: 'namKinhNghiem',
      key: 'namKinhNghiem',
      render: (v) => `${v} năm`,
    },
    {
      title: 'Người phụ trách',
      key: 'phuTrach',
      render: (_, r) => (
        <Space wrap>
          {(r.nguoiCaoTuoiTen || []).map((ten) => (
            <Tag
              key={ten}
              style={{ background: '#EBF5FB', color: '#2E7D9A', borderColor: '#A8D4E6' }}
            >
              {ten}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'trangThaiLabel',
      key: 'trangThai',
      sorter: (a, b) => a.trangThai.localeCompare(b.trangThai),
      render: () => <StatusTag status="success" label="Đang làm việc" />,
    },
    {
      title: 'Hành động',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_, r) => (
        <Space size={6}>
          <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setDetailRecord(r)} />
          {canEdit && <TableActionButton type="edit" tooltip="Chỉnh sửa" icon={<EditOutlined />} onClick={() => handleEdit(r)} />}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Người chăm sóc"
        subtitle="Quản lý danh sách nhân viên và phân công chăm sóc"
        icon={<TeamOutlined />}
        count={caregivers.length}
        countLabel="người chăm sóc"
        extra={canCreate && (
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={handleAdd}>
            Thêm người chăm sóc
          </Button>
        )}
      />

      {/* Thống kê nhanh */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card
            size="small"
            style={{ borderRadius: 10, borderLeft: '4px solid #4CAF93', boxShadow: 'var(--shadow-card)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <TeamOutlined style={{ fontSize: 28, color: '#4CAF93' }} />
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#1A2E3B' }}>{caregivers.length}</div>
                <div style={{ fontSize: 14, color: '#7A93A3' }}>Tổng nhân viên</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card
            size="small"
            style={{ borderRadius: 10, borderLeft: '4px solid #2E7D9A', boxShadow: 'var(--shadow-card)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <UserOutlined style={{ fontSize: 28, color: '#2E7D9A' }} />
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#1A2E3B' }}>{totalPhuTrach}</div>
                <div style={{ fontSize: 14, color: '#7A93A3' }}>Tổng NCT phụ trách</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <TableToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Tìm theo tên, mã nhân viên..."
      />

      <DataTable
        columns={columns}
        dataSource={caregivers}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
        emptyDescription="Chưa có người chăm sóc"
        emptyAction={canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm người chăm sóc</Button>}
      />

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
          { label: 'Nghề nghiệp / Chuyên môn', key: 'trinhDoChuyenMon' },
          { label: 'Số người phụ trách', key: 'soNguoiPhuTrach' },
          { label: 'Người cao tuổi phụ trách', key: 'nguoiCaoTuoiTen', span: 2, render: (values = []) => values.length ? values.join(', ') : 'Chưa được phân công' },
          { label: 'Trạng thái', key: 'trangThai', span: 2, render: () => <StatusTag status="success" label="Đang làm việc" /> },
        ]}
      />

      <ModalForm
        title={editing ? 'Chỉnh sửa người chăm sóc' : 'Thêm người chăm sóc'}
        subtitle="Thông tin cá nhân và chuyên môn của người chăm sóc"
        icon={<TeamOutlined />}
        mode={editing ? 'edit' : 'create'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        form={form}
      >
        <FormSection title="Thông tin cá nhân" description="Thông tin liên hệ của người chăm sóc">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="hoTen" label="Họ và tên" rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}>
                <Input placeholder="VD: Trần Thị Mai" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="soDienThoai" label="Số điện thoại" rules={[{ required: true, message: 'Vui lòng nhập số điện thoại' }, { pattern: /^[0-9]{10,11}$/, message: 'Số điện thoại phải gồm 10–11 chữ số' }]}>
                <Input placeholder="VD: 0901234567" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không đúng định dạng' }]}>
                <Input placeholder="VD: nguoichamsoc@email.com" />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <FormSection title="Thông tin chuyên môn" description="Nghề nghiệp, trình độ và ghi chú liên quan">
          <Form.Item name="ngheNghiep" label="Nghề nghiệp / Trình độ chuyên môn">
            <Input placeholder="VD: Điều dưỡng, hộ lý, người thân" />
          </Form.Item>
          <Form.Item name="ghiChu" label="Ghi chú">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Thông tin kinh nghiệm hoặc lưu ý khi phân công chăm sóc" />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default CaregiversPage;
