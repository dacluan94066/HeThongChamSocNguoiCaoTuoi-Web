// Trang danh mục thuốc - CRUD thuốc
import React, { useState, useEffect } from 'react';
import { Tag, Space, Button, Tooltip, Popconfirm, Form, Input, message } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, MedicineBoxOutlined,
} from '@ant-design/icons';
import { getMedications, createMedication, updateMedication, deleteMedication } from '../../services/medicationService';
import PageHeader from '../../components/PageHeader';
import TableToolbar from '../../components/TableToolbar';
import DataTable from '../../components/DataTable';
import ModalForm from '../../components/ModalForm';

const MedicationsPage = () => {
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    getMedications({ search }).then(setMedications).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [search]);

  const handleAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const handleEdit = (r) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); };

  const handleDelete = async (id) => {
    await deleteMedication(id);
    message.success('Xóa thuốc thành công');
    load();
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      if (editing) {
        await updateMedication(editing.id, values);
        message.success('Cập nhật thành công');
      } else {
        await createMedication({ ...values, trangThai: 'DANG_SU_DUNG', trangThaiLabel: 'Đang sử dụng' });
        message.success('Thêm thuốc thành công');
      }
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Mã thuốc',
      dataIndex: 'maThuoc',
      key: 'maThuoc',
      width: 90,
      render: (v) => (
        <Tag style={{ background: '#EBF5FB', color: '#2E7D9A', borderColor: '#A8D4E6', fontWeight: 600 }}>{v}</Tag>
      ),
    },
    {
      title: 'Tên thuốc',
      key: 'tenThuoc',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            <MedicineBoxOutlined style={{ color: '#2E7D9A', marginRight: 8 }} />
            {r.tenThuoc}
          </div>
          <div style={{ fontSize: 13, color: '#7A93A3' }}>Hoạt chất: {r.hoatChat}</div>
        </div>
      ),
    },
    {
      title: 'Nhóm thuốc',
      dataIndex: 'nhomThuoc',
      key: 'nhomThuoc',
      render: (v) => (
        <Tag style={{ background: '#FEF6E6', color: '#D4870A', borderColor: '#F5A623' }}>{v}</Tag>
      ),
    },
    { title: 'Đơn vị tính', dataIndex: 'donViTinh', key: 'donViTinh', width: 110 },
    { title: 'Cách dùng', dataIndex: 'cachDung', key: 'cachDung' },
    { title: 'Nhà SX', dataIndex: 'nhaSanXuat', key: 'nhaSanXuat' },
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
          <Popconfirm title="Xóa thuốc này?" onConfirm={() => handleDelete(r.id)} okText="Xóa" cancelText="Hủy">
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
        title="Danh mục thuốc"
        subtitle="Quản lý danh sách thuốc trong hệ thống"
        icon={<MedicineBoxOutlined />}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="large">
            Thêm thuốc mới
          </Button>
        }
      />

      <TableToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Tìm tên thuốc, hoạt chất..."
        count={medications.length}
        countLabel="loại thuốc"
      />

      <DataTable
        columns={columns}
        dataSource={medications}
        rowKey="id"
        loading={loading}
        totalLabel="loại thuốc"
      />

      <ModalForm
        title={editing ? 'Chỉnh sửa thuốc' : 'Thêm thuốc mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onFinish={handleSave}
        loading={saving}
        saveLabel={editing ? 'Cập nhật' : 'Thêm mới'}
        form={form}
        width={560}
      >
        <Form.Item name="tenThuoc" label="Tên thuốc" rules={[{ required: true, message: 'Vui lòng nhập tên thuốc' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="hoatChat" label="Hoạt chất">
          <Input />
        </Form.Item>
        <Form.Item name="nhomThuoc" label="Nhóm thuốc">
          <Input />
        </Form.Item>
        <Form.Item name="donViTinh" label="Đơn vị tính">
          <Input />
        </Form.Item>
        <Form.Item name="cachDung" label="Cách dùng">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="chongChiDinh" label="Chống chỉ định">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="tacDungPhu" label="Tác dụng phụ">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="nhaSanXuat" label="Nhà sản xuất">
          <Input />
        </Form.Item>
      </ModalForm>
    </div>
  );
};

export default MedicationsPage;
