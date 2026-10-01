// Trang liên hệ khẩn cấp - Theo từng người cao tuổi
import React, { useState, useEffect } from 'react';
import { Tag, Space, Button, Popconfirm, Form, Select, Input, InputNumber, message, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PhoneOutlined } from '@ant-design/icons';
import { getEmergencyContacts, createContact, updateContact, deleteContact } from '../../services/emergencyService';
import { getElders } from '../../services/elderlyService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import ModalForm, { FormSection } from '../../components/ModalForm';
import usePermission from '../../hooks/usePermission';
import TableAvatar from '../../components/TableAvatar';
import TableActionButton from '../../components/TableActionButton';
import { formatEntityCode } from '../../utils/displayUtils';
import RecordDetailModal from '../../components/RecordDetailModal';

const { Option } = Select;

const EmergencyContactsPage = () => {
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('QLLIENHEKC', 'them');
  const canEdit = hasPermission('QLLIENHEKC', 'sua');
  const canDelete = hasPermission('QLLIENHEKC', 'xoa');
  const [contacts, setContacts] = useState([]);
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedElder, setSelectedElder] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();

  const loadContacts = () => {
    setLoading(true);
    getEmergencyContacts({ nguoiCaoTuoiId: selectedElder })
      .then(setContacts).finally(() => setLoading(false));
  };

  useEffect(() => { getElders().then(setElders); }, []);
  useEffect(() => { loadContacts(); }, [selectedElder]);

  const handleAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const handleEdit = (r) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const elder = elders.find((e) => e.id === values.nguoiCaoTuoiId);
      const data = { ...values, nguoiCaoTuoiTen: elder?.hoTen || '' };
      if (editing) {
        await updateContact(editing.id, data);
        message.success('Cập nhật thành công');
      } else {
        await createContact(data);
        message.success('Thêm liên hệ thành công');
      }
      setModalOpen(false);
      form.resetFields();
      loadContacts();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await deleteContact(id);
    message.success('Xóa liên hệ thành công');
    loadContacts();
  };

  const columns = [
    {
      title: 'Mã liên hệ',
      key: 'maLienHe',
      width: 125,
      render: (_, record) => <span className="entity-code-badge">{formatEntityCode('LHKC', record.id)}</span>,
    },
    {
      title: 'Người cao tuổi',
      dataIndex: 'nguoiCaoTuoiTen',
      key: 'nguoiCaoTuoiTen',
      sorter: (a, b) => a.nguoiCaoTuoiTen.localeCompare(b.nguoiCaoTuoiTen, 'vi'),
      render: (v) => <div className="table-person-cell"><TableAvatar name={v} /><span className="table-person-name">{v}</span></div>,
    },
    {
      title: 'Họ và tên',
      dataIndex: 'hoTen',
      key: 'hoTen',
      sorter: (a, b) => a.hoTen.localeCompare(b.hoTen, 'vi'),
      render: (v) => <div className="table-person-cell"><TableAvatar name={v} /><span className="table-person-name">{v}</span></div>,
    },
    {
      title: 'Mối quan hệ',
      dataIndex: 'moiQuanHe',
      key: 'moiQuanHe',
      render: (v) => (
        <Tag style={{ background: '#EBF5FB', color: '#2E7D9A', borderColor: '#A8D4E6' }}>{v}</Tag>
      ),
    },
    {
      title: 'Số điện thoại',
      key: 'phone',
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <span>
            <PhoneOutlined style={{ color: '#4CAF93', marginRight: 6 }} />
            <strong>{r.soDienThoai}</strong>
          </span>
          {r.soDienThoaiPhu && (
            <span style={{ fontSize: 13, color: '#7A93A3' }}>{r.soDienThoaiPhu}</span>
          )}
        </Space>
      ),
    },
    {
      title: 'Ưu tiên',
      dataIndex: 'uuTien',
      key: 'uuTien',
      width: 90,
      render: (v) => (
        <Tag style={
          v === 1
            ? { background: '#FDEEEE', color: '#E15554', borderColor: '#F5A5A4', fontWeight: 700 }
            : { background: '#F0F4F7', color: '#6B7C8A', borderColor: '#C8D6DE' }
        }>
          #{v}
        </Tag>
      ),
    },
    {
      title: 'Ghi chú',
      dataIndex: 'ghiChu',
      key: 'ghiChu',
      render: (v) => v || <span style={{ color: '#BFBFBF' }}>—</span>,
    },
    {
      title: 'Hành động',
      key: 'action',
      fixed: 'right',
      width: 132,
      render: (_, r) => (
        <Space>
          <TableActionButton type="view" tooltip="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setDetailRecord(r)} />
          {canEdit && <TableActionButton type="edit" tooltip="Chỉnh sửa" icon={<EditOutlined />} onClick={() => handleEdit(r)} />}
          {canDelete && <Popconfirm title="Xóa liên hệ này?" onConfirm={() => handleDelete(r.id)} okText="Xóa" cancelText="Hủy">
            <TableActionButton type="delete" tooltip="Xóa" icon={<DeleteOutlined />} />
          </Popconfirm>}
          {!canEdit && !canDelete && <span style={{ color: '#BFBFBF' }}>—</span>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Liên hệ khẩn cấp"
        subtitle="Danh sách liên hệ khẩn cấp theo từng người cao tuổi"
        icon={<PhoneOutlined />}
        count={contacts.length}
        countLabel="liên hệ"
        extra={canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="large">
            Thêm liên hệ
          </Button>
        )}
      />

      <TableToolbar
        filters={[
          <Select
            key="elder"
            placeholder="Lọc theo người cao tuổi"
            style={{ width: 280 }}
            allowClear
            onChange={setSelectedElder}
          >
            {elders.map((e) => <Option key={e.id} value={e.id}>{e.hoTen}</Option>)}
          </Select>,
        ]}
      />

      <DataTable
        columns={columns}
        dataSource={contacts}
        rowKey="id"
        loading={loading}
        onRow={(record) => ({ onClick: () => setDetailRecord(record) })}
        emptyDescription="Chưa có liên hệ khẩn cấp"
        emptyAction={canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm liên hệ</Button>}
      />

      <RecordDetailModal
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        title={`Chi tiết liên hệ khẩn cấp — ${detailRecord?.hoTen || ''}`}
        record={detailRecord}
        fields={[
          { label: 'Mã liên hệ', key: 'id', render: (value) => formatEntityCode('LHKC', value) },
          { label: 'Người cao tuổi', key: 'nguoiCaoTuoiTen' },
          { label: 'Họ và tên liên hệ', key: 'hoTen' },
          { label: 'Mối quan hệ', key: 'moiQuanHe' },
          { label: 'Số điện thoại', key: 'soDienThoai' },
          { label: 'Số điện thoại phụ', key: 'soDienThoaiPhu' },
          { label: 'Thứ tự ưu tiên', key: 'uuTien' },
          { label: 'Email', key: 'email' },
          { label: 'Ghi chú', key: 'ghiChu', span: 2 },
        ]}
      />

      <ModalForm
        title={editing ? 'Chỉnh sửa liên hệ khẩn cấp' : 'Thêm liên hệ khẩn cấp'}
        subtitle="Thông tin người cần liên hệ khi xảy ra tình huống khẩn cấp"
        icon={<PhoneOutlined />}
        mode={editing ? 'edit' : 'create'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        form={form}
      >
        <FormSection title="Thông tin liên hệ" description="Xác định người cao tuổi và người liên hệ tương ứng">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="nguoiCaoTuoiId" label="Người cao tuổi" rules={[{ required: true, message: 'Vui lòng chọn người cao tuổi' }]}>
                <Select placeholder="Chọn hồ sơ người cao tuổi" showSearch optionFilterProp="children">
                  {elders.map((e) => <Option key={e.id} value={e.id}>{e.hoTen}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="hoTen" label="Họ và tên người liên hệ" rules={[{ required: true, message: 'Vui lòng nhập họ và tên người liên hệ' }]}>
                <Input placeholder="VD: Nguyễn Văn Minh" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="moiQuanHe" label="Mối quan hệ" rules={[{ required: true, message: 'Vui lòng nhập mối quan hệ' }]}>
                <Input placeholder="VD: Con trai, con gái" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="uuTien" label="Thứ tự ưu tiên" initialValue={1} rules={[{ required: true, message: 'Vui lòng nhập thứ tự ưu tiên' }]}>
                <InputNumber min={1} max={5} style={{ width: '100%' }} placeholder="Từ 1 đến 5" />
              </Form.Item>
            </Col>
          </Row>
        </FormSection>

        <FormSection title="Kênh liên lạc" description="Số điện thoại chính, số phụ và email">
          <Row gutter={18}>
            <Col xs={24} md={12}>
              <Form.Item name="soDienThoai" label="Số điện thoại chính" rules={[{ required: true, message: 'Vui lòng nhập số điện thoại chính' }, { pattern: /^[0-9]{10,11}$/, message: 'Số điện thoại phải gồm 10–11 chữ số' }]}>
                <Input placeholder="VD: 0901234567" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="soDienThoaiPhu" label="Số điện thoại phụ" rules={[{ pattern: /^[0-9]{10,11}$/, message: 'Số điện thoại phải gồm 10–11 chữ số' }]}>
                <Input placeholder="Số điện thoại dự phòng" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không đúng định dạng' }]}>
                <Input placeholder="VD: lienhe@email.com" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="ghiChu" label="Ghi chú">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Thông tin cần lưu ý khi liên hệ" />
          </Form.Item>
        </FormSection>
      </ModalForm>
    </div>
  );
};

export default EmergencyContactsPage;
