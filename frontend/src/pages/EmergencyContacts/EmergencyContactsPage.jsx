// Trang liên hệ khẩn cấp - Theo từng người cao tuổi
import React, { useState, useEffect } from 'react';
import { Tag, Space, Button, Tooltip, Popconfirm, Form, Select, Input, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PhoneOutlined } from '@ant-design/icons';
import { getEmergencyContacts, createContact, updateContact, deleteContact } from '../../services/emergencyService';
import { getElders } from '../../services/elderlyService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import ModalForm from '../../components/ModalForm';

const { Option } = Select;

const EmergencyContactsPage = () => {
  const [contacts, setContacts] = useState([]);
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedElder, setSelectedElder] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
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
      title: 'Người cao tuổi',
      dataIndex: 'nguoiCaoTuoiTen',
      key: 'nguoiCaoTuoiTen',
      render: (v) => <strong style={{ fontSize: 15 }}>{v}</strong>,
    },
    {
      title: 'Họ và tên',
      dataIndex: 'hoTen',
      key: 'hoTen',
      render: (v) => <strong style={{ fontSize: 15 }}>{v}</strong>,
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
      width: 90,
      render: (_, r) => (
        <Space>
          <Tooltip title="Chỉnh sửa">
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} />
          </Tooltip>
          <Popconfirm title="Xóa liên hệ này?" onConfirm={() => handleDelete(r.id)} okText="Xóa" cancelText="Hủy">
            <Tooltip title="Xóa">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
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
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="large">
            Thêm liên hệ
          </Button>
        }
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
        count={contacts.length}
        countLabel="liên hệ"
      />

      <DataTable
        columns={columns}
        dataSource={contacts}
        rowKey="id"
        loading={loading}
        totalLabel="liên hệ"
      />

      <ModalForm
        title={editing ? 'Chỉnh sửa liên hệ' : 'Thêm liên hệ khẩn cấp'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        saveLabel={editing ? 'Cập nhật' : 'Thêm mới'}
        form={form}
        width={520}
      >
        <Form.Item name="nguoiCaoTuoiId" label="Người cao tuổi" rules={[{ required: true, message: 'Vui lòng chọn' }]}>
          <Select placeholder="Chọn người cao tuổi">
            {elders.map((e) => <Option key={e.id} value={e.id}>{e.hoTen}</Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="hoTen" label="Họ và tên" rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="moiQuanHe" label="Mối quan hệ" rules={[{ required: true, message: 'Vui lòng nhập mối quan hệ' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="soDienThoai" label="Số điện thoại chính" rules={[{ required: true, message: 'Vui lòng nhập số điện thoại' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="soDienThoaiPhu" label="Số điện thoại phụ">
          <Input />
        </Form.Item>
        <Form.Item name="email" label="Email">
          <Input />
        </Form.Item>
        <Form.Item name="uuTien" label="Thứ tự ưu tiên">
          <Input type="number" min={1} max={5} />
        </Form.Item>
        <Form.Item name="ghiChu" label="Ghi chú">
          <Input.TextArea rows={2} />
        </Form.Item>
      </ModalForm>
    </div>
  );
};

export default EmergencyContactsPage;
